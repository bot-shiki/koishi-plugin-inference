import { capitalize, Context, isInteger, Session } from 'koishi'
import {} from '@koishijs/plugin-help'
import _chapters from './data/chapters.yml'
import _questions from './data/questions.yml'

declare module 'koishi' {
  interface User {
    inference: string[]
    inferenceRank: number
  }
}

export const chapterCount = 19
export const spChapterThreshold = 100

export interface Chapter {
  id: string
  name: string
  actual?: boolean
  progress: number
  content: string[][]
  additionalContent?: string[]
}

export interface Question {
  id: string
  chapter: number
  clue?: string
  answer: string
  info?: string
  meaning?: string
  category?: string
  comment?: string
  hints: string[]
  solution?: string[]
  prerequisites?: ['prefix' | 'suffix' | 'question' | 'chapter', number, number?][]
}

const hasHidden = [1, 3, 5, 7, 9, 13, 17]
export const chapters: Chapter[] = _chapters
export const chapterMap: Record<string, Chapter> = {}
export const questions: Record<number, Question[]> = {}
export const questionMap: Record<string, Question> = {}
export let questionCount = 0

chapters.forEach(chap => chapterMap[chap.id] = chap)

function countUnlocked(inference: string[], ...chapters: number[]) {
  let total = 0
  for (const chapId of chapters) {
    const prefix = chapId + '-'
    if (inference.filter(id => id.startsWith(prefix)).length >= 10) total += 1
  }
  return total
}

function isLocked(inference: string[], chapId: string) {
  return chapId === '0' && inference.length < spChapterThreshold
    || chapId.endsWith('.5') && !countUnlocked(inference, +chapId.slice(0, -2))
}

_questions.forEach((question: Question) => {
  const chapter = question.chapter = parseFloat(question.id)
  if (!questions[chapter]) questions[chapter] = []
  questionMap[question.id] = question
  questions[chapter].push(question)
  if (!question.category) question.category = ''
  if (chapter <= chapterCount) questionCount += 1
})

const chapterIds = Object.keys(questions).sort((a, b) => +a > +b ? 1 : -1)

function getProgress(inference: string[]) {
  let progress = 1
  let solveCount = 0
  for (const qid of inference) {
    const cid = parseFloat(qid)
    if (!isInteger(cid)) continue
    if (cid > progress) {
      progress = cid
      solveCount = 1
    } else if (cid === progress) {
      solveCount += 1
    }
  }
  if (solveCount >= 5) progress += 1
  return progress
}

// Profile.add(({ inference, inferenceRank }) => {
//   return `推断题已完成：${inference.length}/${questionCount}${inferenceRank ? ` (#${inferenceRank})` : ''}`
// }, ['inference', 'inferenceRank'], 200)

// const INFERENCE_VOLUME = 'inference.introduction'
// const INFERENCE_HIDDEN = 'inference.hidden'

// Achievement.add({
//   id: INFERENCE_VOLUME,
//   name: '失落的勇者',
//   category: 'game',
//   desc: '通关专业术语推断题第一卷。',
//   affinity: 10,
//   progress: user => (getProgress(user.inference) - 1) / 10,
// }, ['inference'])

// Achievement.add({
//   id: INFERENCE_HIDDEN,
//   name: '掘密的勇者',
//   category: 'game',
//   desc: '解锁 5 个专业术语推断题隐藏章节。',
//   affinity: 5,
//   hidden: user => !countUnlocked(user.inference, ...hasHidden),
//   progress: user => (countUnlocked(user.inference, ...hasHidden)) / 5,
// }, ['inference'])

// Affinity.add(60, (user) => {
//   const { length } = user.inference
//   const value = Math.ceil(length / 4)
//   if (!value) return []
//   const label = length <= 30 ? '推理入门'
//     : length <= 60 ? '推理上手'
//       : length <= 100 ? '逻辑鬼才'
//         : length <= 200 ? '超越人类的直觉'
//           : '字母之神'
//   return [value, label]
// }, ['inference'], () => [Math.ceil(questionCount / 4), '字母之神'])

// Rank.value('inference', ['推断题'], 'list_length(`inference`)', { format: ' 道', key: 'inferenceRank' })

const stateSet = new Set<string>()

function showQuestions(session: Session<'inference'>) {
  const { inference } = session.user
  const output: string[] = []
  const finished: Record<string, string[]> = {}
  for (const id of inference) {
    const chapterId = parseFloat(id)
    if (!finished[chapterId]) {
      finished[chapterId] = [id]
    } else {
      finished[chapterId].push(id)
    }
  }

  chapterIds.forEach((index) => {
    if (parseFloat(index) > chapterCount) return
    if (isLocked(inference, index)) return
    const list = (finished[index] || []).join(', ')
    let message = `Chapter ${index}：共 ${questions[index].length} 题`
    if (!finished[index]) {
      message += '。'
    } else if (finished[index].length === questions[index].length) {
      message += '，已全部完成。'
    } else {
      message += `，已完成 ${list}。`
    }
    output.push(message)
  })

  const percentage = Math.floor(inference.length / questionCount * 100).toFixed()
  output.unshift(`${session.username}，你已经做出 ${questionCount} 道题目中的 ${inference.length} 道，达成率 ${percentage}%。`)
  return output.join('\n')
}

function showContents(session: Session<'inference'>, progress: number) {
  const { inference } = session.user
  const output: string[] = []
  for (const chapter of chapters) {
    if (chapter.progress > chapterCount) continue
    let message = `${chapter.id} ${chapter.name}`
    if (chapter.id.startsWith('Chapter-')) {
      if (isLocked(inference, chapter.id.slice(8))) continue
      const chapterId = parseFloat(chapter.id.slice(8))
      if (questions[chapterId]) {
        message += `（共 ${questions[chapterId].length} 题）`
      }
    }
    output.push(message)
  }
  output.unshift(`英语推断题（目前已解锁到第 ${progress} 章）`, '================')
  output.push('================', '输入“推断题 章节名/题号”，查看对应的章节和题目。')
  return output.join('\n')
}

export const name = 'inference'

export function apply(ctx: Context) {
  ctx.model.extend('user', {
    inference: 'list',
  })

  ctx.command('inference [id:string] [words:text] 英语推断题')
    .alias('inf', 'tdt')
    .userFields(['id', /* 'achievement', 'money', 'wealth', 'timers', */ 'inference', 'name', 'authority'])
    .shortcut('推断题', { fuzzy: true })
    .shortcut('推断题列表', { options: { list: true } })
    .shortcut('我的推断题', { options: { list: true } })
    .shortcut('查看推断题', { options: { list: true } })
    .option('list', '-l  查看已完成的题目列表')
    .option('solution', '-s  显示题目答案与解析')
    .option('answers', '-a  查看全部题目答案', { authority: 4, hidden: true })
    .option('forced', '-f  强行查看章节或题目', { authority: 4, hidden: true })
    // .checkTimer('$game')
    .action(async ({ session, options }, input, word) => {
      const { inference } = session.user

      if (options.answers) {
        return chapterIds.map((index) => {
          return `${index}: ${questions[+index].map(q => q.answer).join(', ')}.`
        }).join('\n')
      }

      if (!input && options.list) return showQuestions(session)

      const ctxId = session.channelId
      if (stateSet.has(ctxId)) {
        return '当前正在显示章节文本，请稍后再试。'
      }

      const actualProgress = getProgress(inference)
      const progress = Math.min(actualProgress, chapterCount)
      if (!input) return showContents(session, progress)

      input = capitalize(input.toLowerCase())
      if (/^\d+(\.\d+)?$/.test(input)) input = 'Chapter-' + input
      const chapter = chapterMap[input]
      if (chapter) {
        if (!options.forced) {
          if (chapter.id.startsWith('Chapter-') && isLocked(inference, chapter.id.slice(8))) {
            return chapter.id === 'Chapter-0' ? '总共做出 100 道题目以上后才可查看本章内容。' : '没有找到对应的章节和题目。'
          }
          if (chapter.actual ? chapter.progress + 1 > actualProgress : chapter.progress > progress) {
            return '将前一章的题目做出 5 道以上后才可查看本章内容。'
          }
        }
        const output = chapter.content.map(lines => lines.join('\n'))
        if (chapter.progress < actualProgress && chapter.additionalContent) {
          output.push(chapter.additionalContent.join('\n'))
        }

        // 问题列表
        let message = ''
        if (input.startsWith('Chapter-')) {
          const questionIds = questions[+input.slice(8)].map(q => q.id)
          message = `本章附带问题列表：${questionIds.join(', ')}。`
          if (chapter.id === 'Chapter-0') {
            const { length } = inference.filter(id => id.startsWith('0-'))
            if (length < output.length) {
              message = '（请完成更多题目解锁后续剧情）\n' + message
              output.splice(length + 1, Infinity)
            }
          }
        }

        try {
          stateSet.add(ctxId)
          if (!options.list) {
            for (const text of output) {
              await session.sendQueued(text)
            }
          } else if (input.startsWith('Chapter-')) {
            const prefix = chapter.id.slice(8) + '-'
            const finished = inference.filter(id => id.startsWith(prefix))
            if (finished.length === questions[chapter.id.slice(8)].length) {
              message = message.slice(0, -1) + '，已全部完成。'
            } else if (finished.length) {
              message += `\n已完成 ${finished.join(', ')}。`
            }
          }
          await session.sendQueued(message)
          return
        } catch (error) {
          ctx.logger('inference').warn(error)
          return
        } finally {
          stateSet.delete(ctxId)
        }
      }

      const question = questionMap[input]
      if (!question) return '没有找到对应的章节和题目。'
      const { category, clue, hints, answer, solution, info, comment, meaning = '' } = question
      if (!options.forced) {
        if (isLocked(inference, '' + question.chapter)) {
          return question.chapter ? '没有找到对应的章节和题目。' : '总共做出 100 道题目以上后才可查看本章内容。'
        }
        if (question.chapter > progress) {
          return '将前一章的题目做出 5 道以上后才可查看本章内容。'
        }
        if (question.prerequisites) {
          let met = true
          const output = [`问题 ${input}（未解锁）`]
          for (const [type, arg1, arg2] of question.prerequisites) {
            let completed: boolean, hint: string
            if (type === 'prefix') {
              const prefix = arg1 + '-'
              const total = inference.filter(id => id.startsWith(prefix)).length
              completed = total >= arg2
              hint = `完成至少 ${arg2} 道第 ${arg1} 章的题目。`
              if (!completed) hint += `（${total}/${arg2}）`
            } else if (type === 'suffix') {
              const suffix = '-' + arg1
              const total = inference.filter(id => id.endsWith(suffix)).length
              completed = total >= arg2
              hint = `完成至少 ${arg2} 道题号为 X${suffix} 的题目。`
              if (!completed) hint += `（${total}/${arg2}）`
            } else if (type === 'chapter') {
              completed = !isLocked(inference, '' + (arg1 - 0.5))
              hint = `解锁隐藏章节 ${arg1}。`
            } else if (type === 'question') {
              const id = `${arg1}-${arg2}`
              completed = inference.includes(id)
              hint = `完成题目 ${id}。`
            }
            met = met && completed
            output.push(`[${completed ? '√' : '  '}] ${hint}`)
          }
          if (!met) return output.join('\n')
        }
      }

      const answered = inference.includes(input)
      if (!word) {
        if (!options.forced && options.solution && !answered) {
          return '只有做出本题才可以查看解析。'
        }
        const output = hints.map((hint, index) => `${index + 1}. ${hint}`)
        output.unshift(clue
          ? `线索：${clue}${category ? `（${category}）` : ''}`
          : category)
        if (options.solution) output.unshift(`答案：${answer}${info ? ` (${info})` : ''} ${meaning}`)
        output.unshift(`问题 ${input}${answered ? '（已作答）' : ''}`)
        if (comment) output.push('注：' + comment)
        await session.send(output.join('\n'))
        if (options.solution && solution) await session.send(solution.join('\n'))
        return
      }

      word = word.toLowerCase()
      if (answered) return '你已经作答过本题。'
      if (answer !== word) return '回答错误。'
      const hyphen = question.id.indexOf('-') + 1
      const prefix = question.id.slice(0, hyphen)
      const subId = parseInt(question.id.slice(hyphen))
      const index = inference.findIndex((id) => {
        const separator = id.indexOf('-')
        const cid = parseFloat(id.slice(0, separator))
        if (cid > question.chapter) return true
        if (cid < question.chapter) return false
        const qid = parseInt(id.slice(separator + 1))
        if (qid > subId) return true
      })
      if (index < 0) {
        inference.push(input)
      } else {
        inference.splice(index, 0, input)
      }
      let message = '回答正确！'
      const output: string[] = []
      const newProgress = getProgress(inference)
      const spChapter = inference.length === spChapterThreshold ? '0, ' : ''
      if (newProgress > actualProgress) {
        if (newProgress <= chapterCount) message += `你已成功解锁第 ${spChapter}${newProgress} 章！`
        if (newProgress === 11) {
          output.push(chapterMap['Chapter-10'].additionalContent.join('\n'))
          // session.achieve(INFERENCE_VOLUME, output)
        }
      } else if (inference.filter(id => id.startsWith(prefix)).length === 10 && hasHidden.includes(question.chapter)) {
        message += `你已成功解锁第 ${spChapter}${question.chapter + 0.5} 章！`
      } else if (spChapter) {
        message += `你已成功解锁第 0 章！`
      }
      // if (countUnlocked(inference, ...hasHidden) >= 5) {
      //   session.achieve(INFERENCE_HIDDEN, output)
      // }
      if (question.meaning) {
        output.unshift(question.meaning)
      }
      output.unshift(message)
      await session.send(output.join('\n'))
    })
}
