import type { Metadata } from "next";
import { WeatherLesson } from "@/features/agent-lab/weather-lesson";

export const metadata: Metadata = {
  title: "成都，今天比昨天热吗？ · Agent 实验室",
  description: "可以暂停、回退和改变返回结果的天气教学模拟。",
};

export default function WeatherPage() { return <WeatherLesson />; }
