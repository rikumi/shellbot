const cp = require('child_process');
const HTTPSProxyAgent = require('https-proxy-agent');
const { Telegraf } = require('telegraf');
const config = require('./config.json');

process.on('uncaughtException', (e) => { console.error(e) });
process.on('unhandledRejection', (e) => { throw e });

const bot = new Telegraf(config.telegramBotToken, {
  telegram: {
    agent: config.proxy ? new HTTPSProxyAgent(`http://${config.proxy.host}:${config.proxy.port}`) : undefined,
  },
});

/**
 * @type {{ [key: number]: cp.ChildProcess }}
 */
const childProcessByChat = {};

bot.on('message', (ctx) => {
  const { message } = ctx;
  if (!message.text || config.nonslash == null && !message.text.startsWith('/')) return;
  if (!config.admins.includes(message.from.username)) return;

  if (!message.text.startsWith('/')) {
    if (!config.nonslash) return;
    if (config.nonslash === true) {
      message.text = '/' + message.text;
    } else {
      message.text = String(config.nonslash)
        .replace(/\$username/g, message.from.username)
        .replace(/\$content/g, message.text);
    }
  }

  const codeReply = (content) => {
    const trimmedContent = String(content).trim();
    console.log(content);
    ctx.reply(trimmedContent.replace(/\n$/, ''), {
      entities: [{ type: 'code', offset: 0, length: trimmedContent.length }],
    });
  };

  const command = message.text.substring(1).trim();
  console.log('>', command);

  if (!childProcessByChat[message.chat.id]) {
    codeReply(`Spawning process ${command.split(' ')[0]}`);
    const child = cp.spawn('sh', ['-c', command], { stdio: 'pipe' });
    process.stdin.pipe(child.stdin);
    child.stdout.on('data', codeReply);
    child.stderr.on('data', codeReply);
    child.on('error', codeReply);
    child.on('close', (code) => {
      codeReply(`Process ${command.split(' ')[0]} exited with status code ${code}`);
      delete childProcessByChat[message.chat.id];
    });
    childProcessByChat[message.chat.id] = child;
    return;
  }

  const child = childProcessByChat[message.chat.id];
  try {
    if (/^SIG[A-Z]+$/.test(command)) {
      return child.kill(command);
    }
    child.stdin.write(Buffer.from(command + '\n'));
  } catch (e) {
    codeReply(`Failed to write to ${command.split(' ')[0]}, closing pipe`);
    codeReply(e);
    delete childProcessByChat[message.chat.id];
  }
});

bot.launch();