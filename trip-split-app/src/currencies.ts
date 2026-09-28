export const CURRENCIES = ["KRW", "JPY", "USD", "EUR", "GBP", "CNY", "HKD", "TWD", "THB", "VND", "SGD", "AUD", "CAD", "CHF", "NZD", "MYR", "PHP", "IDR", "INR", "AED"] as const;
export type Currency = typeof CURRENCIES[number];
export const CURRENCY_NAMES: Record<Currency, string> = {
  "KRW": "대한민국 원",
  "JPY": "일본 엔",
  "USD": "미국 달러",
  "EUR": "유로",
  "GBP": "영국 파운드",
  "CNY": "중국 위안",
  "HKD": "홍콩 달러",
  "TWD": "대만 달러",
  "THB": "태국 바트",
  "VND": "베트남 동",
  "SGD": "싱가포르 달러",
  "AUD": "호주 달러",
  "CAD": "캐나다 달러",
  "CHF": "스위스 프랑",
  "NZD": "뉴질랜드 달러",
  "MYR": "말레이시아 링깃",
  "PHP": "필리핀 페소",
  "IDR": "인도네시아 루피아",
  "INR": "인도 루피",
  "AED": "UAE 디르함"
};
