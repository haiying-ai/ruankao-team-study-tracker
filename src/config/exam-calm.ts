/**
 * 临考期间的低压力界面开关。考试结束或需要恢复完整学习站时改为 false。
 */
export const EXAM_CALM_MODE = true

export const EXAM_CALM_MESSAGES = [
  '愿你稳稳落笔，把会的都写出来，超常发挥。',
  '你已经走到了这里，接下来只管从容赴考，顺利通关。',
  '题目会读懂，思路会清晰，答案会自然浮现。',
  '此刻不必追赶，带着平常心，把实力交给考场。',
  '好好吃饭，好好睡觉；考场上，愿你心静、手稳、脑清。',
  '愿每一道会做的题都不被错过，每一分努力都有回响。',
  '放松一点，你准备得比自己以为的更充分。',
  '愿你沉着应对，发挥稳定，把这次考试考成自己的主场。'
] as const

export const CALM_HIDDEN_ROUTE_NAMES = new Set(['plan', 'progress', 'team', 'admin'])
