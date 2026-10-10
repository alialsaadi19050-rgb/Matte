// Det som lästs från en pipe men inte använts än (flera rader kan komma på en gång).
let piped = ''

// Frågar efter en rad i terminalen. Med hidden visas inte det du skriver.
export function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    stdout.write(question)
    if (!stdin.isTTY) {
      // Ingen terminal (t.ex. inmatning via pipe): läs en rad som den är.
      const take = () => {
        const nl = piped.indexOf('\n')
        if (nl === -1) return false
        const line = piped.slice(0, nl).replace(/\r$/, '')
        piped = piped.slice(nl + 1)
        stdout.write('\n')
        resolve(line)
        return true
      }
      if (take()) return
      const onData = (d: Buffer) => {
        piped += d.toString('utf8')
        if (!take()) return
        stdin.off('data', onData)
        stdin.pause()
      }
      stdin.on('data', onData)
      return
    }
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          return reject(new Error('Avbrutet.'))
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value) {
            value = value.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        value += ch
        stdout.write(hidden ? '•' : ch)
      }
    }
    stdin.on('data', onData)
  })
}
