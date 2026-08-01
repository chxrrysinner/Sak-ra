import client from '../../core/client.js';
import { styledEmbed } from '../../core/embeds.js';

async function handleSlashCommand(interaction) {
  const roundtripMs = Math.max(0, Date.now() - interaction.createdTimestamp);
  const websocketMs = Math.round(client.ws.ping);

  await interaction.reply({
    embeds: [
      styledEmbed('Latency', [
        `**Latency:** ${websocketMs}ms`,
        `**Roundtrip:** ${roundtripMs}ms`
      ].join('\n'))
    ],
    ephemeral: true
  });
}

async function handlePrefixCommand(message, args, guildId) {
  const websocketMs = Math.round(client.ws.ping);

  await message.channel.send({
    embeds: [
      styledEmbed('Latency', [
        `**Latency:** ${websocketMs}ms`,
        `**Roundtrip:** (not available in prefix mode)`
      ].join('\n'))
    ]
  });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
