[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 3000,
    [ValidateRange(1, 120)][int]$StartupTimeoutSeconds = 30,
    [switch]$NoBrowser,
    [switch]$NoDialog
)

# Compatible with Windows PowerShell 5.1. Keep this file UTF-8 with BOM.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$radarUrl = "http://127.0.0.1:$Port"
$logDirectory = Join-Path $projectRoot 'data\launcher'
$attemptId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$launchLog = Join-Path $logDirectory "$attemptId-launcher.log"
$serverOutput = Join-Path $logDirectory "$attemptId-server.stdout.log"
$serverError = Join-Path $logDirectory "$attemptId-server.stderr.log"

function Write-LaunchLog([string]$Message) {
    Add-Content -LiteralPath $launchLog -Value ('{0} {1}' -f (Get-Date -Format 'o'), $Message) -Encoding UTF8
}

function Read-LocalResponse([string]$Address) {
    $request = [Net.HttpWebRequest]::Create($Address)
    $request.Proxy = $null
    $request.AllowAutoRedirect = $false
    $request.Timeout = 2000
    $request.ReadWriteTimeout = 2000
    $request.KeepAlive = $false
    $response = $null
    try {
        try { $response = $request.GetResponse() }
        catch [Net.WebException] {
            if (-not $_.Exception.Response) { throw }
            $response = $_.Exception.Response
        }
        $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
        try {
            $buffer = New-Object char[] 4096
            $body = New-Object Text.StringBuilder
            $deadline = [DateTime]::UtcNow.AddSeconds(3)
            while (($length = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
                if ($body.Length + $length -gt 1048576 -or [DateTime]::UtcNow -gt $deadline) {
                    throw '本机服务响应过大或读取超时。'
                }
                [void]$body.Append($buffer, 0, $length)
            }
            return @{ Status = [int]$response.StatusCode; Body = $body.ToString() }
        } finally { $reader.Dispose() }
    } finally { if ($response) { $response.Dispose() } }
}

function Test-ListeningPort {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $connection = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $connection.Wait(300)) { return $false }
        return $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

function Get-RadarStatus {
    try {
        $homeResponse = Read-LocalResponse "$radarUrl/"
        if ($homeResponse.Status -ne 200) { throw "首页返回 HTTP $($homeResponse.Status)。" }
        if ($homeResponse.Body -notmatch '<title[^>]*>AI Radar(?:\s|[<·])') { return 'foreign' }
        $response = Read-LocalResponse "$radarUrl/api/sources"
        if ($response.Status -ne 200) {
            $detail = $response.Body.Substring(0, [Math]::Min(600, $response.Body.Length))
            throw "本机 API 返回 HTTP $($response.Status)：$detail"
        }
        $data = ConvertFrom-Json -InputObject $response.Body
        if (($data.sources -is [Array]) -and ($data.provider.name -is [string]) -and
            ($data.provider.configured -is [bool]) -and ($data.provider.development -is [bool])) {
            return 'ready'
        }
        return 'waiting'
    } catch {
        Write-LaunchLog "就绪检查尚未通过：$($_.Exception.Message)"
        return 'waiting'
    }
}

function Start-RadarServer {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { throw '未找到 Node.js。请安装 Node.js 22.13 或更高版本后重试。' }
    $nextCli = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
    if (-not (Test-Path -LiteralPath $nextCli -PathType Leaf)) {
        throw '项目依赖尚未安装。请在项目目录运行 npm install 后重试。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.next\BUILD_ID') -PathType Leaf)) {
        throw '未找到生产构建。请在项目目录运行 npm run build 后重试。'
    }
    # Start-Process joins ArgumentList entries; the CLI path therefore needs explicit quotes.
    $arguments = @(('"{0}"' -f $nextCli), 'start', '--hostname', '127.0.0.1', '--port', $Port.ToString())
    $process = Start-Process -FilePath $node.Source -ArgumentList $arguments -WorkingDirectory $projectRoot `
        -WindowStyle Hidden -RedirectStandardOutput $serverOutput -RedirectStandardError $serverError -PassThru
    Write-LaunchLog "已启动后台服务 PID=$($process.Id)；stdout=$serverOutput；stderr=$serverError"
    return $process
}

function Wait-RadarReady($Process, [bool]$AlreadyListening) {
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
        $status = Get-RadarStatus
        if ($status -eq 'ready') { return }
        if ($status -eq 'foreign') {
            throw "端口 $Port 已被其他程序占用。请先关闭或调整该程序，再打开 AI Radar。"
        }
        if ($Process) {
            $Process.Refresh()
            if ($Process.HasExited) { throw "AI Radar 服务启动后提前退出，退出码为 $($Process.ExitCode)。请查看服务错误日志。" }
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($AlreadyListening) {
        throw "端口 $Port 已有服务，但未能识别为可用的 AI Radar。请检查端口占用或服务状态后重试。"
    }
    throw "等待 AI Radar 就绪超时（$StartupTimeoutSeconds 秒）。请查看服务日志后重试。"
}

function Show-LaunchFailure([string]$Message) {
    $details = "AI Radar 打开失败。`r`n`r`n$Message`r`n`r`n日志：$launchLog"
    if (Test-Path -LiteralPath $serverError) { $details += "`r`n服务错误日志：$serverError" }
    [Console]::Error.WriteLine($details)
    if (-not $NoDialog) {
        Add-Type -AssemblyName PresentationFramework
        [void][Windows.MessageBox]::Show($details, 'AI Radar', 'OK', 'Error')
    }
}

$mutex = $null
$acquired = $false
$child = $null
$ready = $false
$exitCode = 0
$failureMessage = $null
try {
    [void][IO.Directory]::CreateDirectory($logDirectory)
    Write-LaunchLog "打开请求；项目=$projectRoot；地址=$radarUrl"
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $identity = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes("$($projectRoot.ToLowerInvariant())|$Port"))).Replace('-', '') }
    finally { $hash.Dispose() }
    $mutex = New-Object Threading.Mutex($false, "Local\AI-Radar-$identity")
    try { $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds($StartupTimeoutSeconds + 10)) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw '另一个 AI Radar 启动请求仍在进行，请稍后再试。' }

    $alreadyListening = Test-ListeningPort
    if (-not $alreadyListening) { $child = Start-RadarServer }
    Wait-RadarReady -Process $child -AlreadyListening $alreadyListening
    $ready = $true
    Write-LaunchLog $(if ($child) { '后台服务已就绪。' } else { '复用已运行的 AI Radar。' })
    if (-not $NoBrowser) {
        Start-Process -FilePath $radarUrl -ErrorAction Stop
        Write-LaunchLog '已交给 Windows 默认浏览器打开。'
    }
    Write-Output "AI Radar 已打开：$radarUrl"
} catch {
    $exitCode = 1
    $message = $_.Exception.Message
    # Only terminate the exact child created by this attempt, never a port owner we did not start.
    if ($child -and -not $ready) {
        try { $child.Refresh(); if (-not $child.HasExited) { $child.Kill(); [void]$child.WaitForExit(5000) } }
        catch { $message += "`r`n后台进程清理失败：$($_.Exception.Message)" }
    }
    try { Write-LaunchLog "失败：$message" } catch { $message += "`r`n日志写入失败：$($_.Exception.Message)" }
    $failureMessage = $message
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
    if ($child) { $child.Dispose() }
}
if ($failureMessage) { Show-LaunchFailure $failureMessage }
exit $exitCode
