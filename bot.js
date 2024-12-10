const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
    ],
});

const VOICE_CATEGORY_ID = '1315702086821744722'; // ID danh mục quản lý
const JOIN_TO_CREATE_ID = '1315893389602066542'; // ID kênh "Join to Create"
const renamedRooms = new Map();
const roomOwners = new Map();
const activeChannels = new Set();

// Hàm xóa kênh trống sau 2 giây
async function deleteEmptyChannels(categoryId) {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const category = guild.channels.cache.get(categoryId);
    if (!category || category.type !== 4) return;

    const voiceChannels = category.children.cache.filter(channel => channel.type === 2);

    for (const [channelId, voiceChannel] of voiceChannels) {
        if (voiceChannel.id === JOIN_TO_CREATE_ID) continue;

        if (voiceChannel.members.size === 0) {
            setTimeout(async () => {
                const refreshedChannel = guild.channels.cache.get(channelId);
                if (refreshedChannel && refreshedChannel.members.size === 0) {
                    try {
                        roomOwners.delete(refreshedChannel.id);
                        await refreshedChannel.delete();
                        console.log(`Đã xóa kênh trống: ${refreshedChannel.name}`);
                    } catch (error) {
                        console.error(`Lỗi khi xóa kênh: ${refreshedChannel.id}`, error);
                    }
                }
            }, 2000);
        }
    }
}

// Tạo phòng khi người dùng vào "Join to Create"
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;

    if (newState.channelId === JOIN_TO_CREATE_ID) {
        if (activeChannels.has(newState.id)) return;

        activeChannels.add(newState.id);

        try {
            const category = guild.channels.cache.get(VOICE_CATEGORY_ID);
            if (!category || category.type !== 4) {
                console.error('Danh mục không tồn tại hoặc không phải danh mục!');
                return;
            }

            const defaultName = `Room of ${newState.member.user.username}`;
            const storedName = renamedRooms.get(newState.member.id) || defaultName;

            const voiceChannel = await guild.channels.create({
                name: storedName,
                type: 2,
                parent: VOICE_CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: newState.member.id,
                        allow: [
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.MuteMembers,
                            PermissionsBitField.Flags.DeafenMembers,
                        ],
                    },
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.Connect],
                    },
                ],
            });

            await newState.member.voice.setChannel(voiceChannel.id);
            roomOwners.set(voiceChannel.id, newState.member.id);

            const embed = new EmbedBuilder()
                .setTitle('🎉 Đã tạo phòng thành công!')
                .setDescription(
                    `Chào mừng, **${newState.member.user.username}**! Đây là phòng riêng của bạn.\n\n🛠 **Usage Guide:**\n- Nhấp **Commands** để xem các lệnh khả dụng.\n- Nhấp **Call DJ** để kiểm tra bot DJ.`
                )
                .setColor(0x00FF7F)
                .setFooter({ text: 'Hệ thống tự động', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('commands_list')
                        .setLabel('Commands')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('check_dj')
                        .setLabel('Check DJ')
                        .setStyle(ButtonStyle.Primary),
                );

            await voiceChannel.send({
                content: `🎉 **Phòng của bạn đã sẵn sàng, ${newState.member}!**`,
                embeds: [embed],
                components: [row],
            });

            console.log(`Phòng mới đã tạo: ${voiceChannel.name}`);
        } catch (error) {
            console.error('Error creating voice channel:', error);
        } finally {
            activeChannels.delete(newState.id);
        }
    }

    if (oldState.channelId && !newState.channelId) {
        const voiceChannel = guild.channels.cache.get(oldState.channelId);

        if (voiceChannel) {
            if (voiceChannel.id === JOIN_TO_CREATE_ID) {
                console.log('Không thể xóa kênh "Join to Create"');
                return;
            }
            if (roomOwners.get(voiceChannel.id) === oldState.member.id) {
                console.log(`Chủ phòng đã rời phòng: ${voiceChannel.name}`);
                roomOwners.delete(voiceChannel.id); // Xóa quyền sở hữu
            }

            if (voiceChannel.parentId === VOICE_CATEGORY_ID && voiceChannel.members.size === 0) {
                try {
                    roomOwners.delete(voiceChannel.id);
                    await voiceChannel.delete();
                    console.log(`Phòng đã bị xóa: ${voiceChannel.name}`);
                } catch (error) {
                    console.error(`Lỗi khi xóa phòng: ${voiceChannel.id}`, error);
                }
            }
        }
    }
});

// Đăng ký và xử lý các lệnh Slash
client.on('ready', async () => {
    console.log(`Bot đã sẵn sàng với tên: ${client.user.tag}`);
    const guild = client.guilds.cache.first();
    if (!guild) return;
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    const { commandName, customId } = interaction;
    const memberChannel = interaction.member.voice.channel;
    const roomOwner = roomOwners.get(memberChannel?.id);

    if (!memberChannel && interaction.isCommand()) {
        return interaction.reply({ content: 'Bạn phải ở trong một phòng thoại!', ephemeral: true });
    }

    try {
        if (interaction.isCommand()) {
            switch (commandName) {
                case 'rename': {
                    const newName = interaction.options.getString('name');
                    if (roomOwner !== interaction.member.id) {
                        return interaction.reply({ content: 'Bạn không phải chủ phòng!', ephemeral: true });
                    }
                    await memberChannel.setName(newName);
                    renamedRooms.set(interaction.member.id, newName);
                    return interaction.reply({ content: `Tên phòng đã được đổi thành **${newName}**!`, ephemeral: true });
                }
                case 'lock': {
                    if (roomOwner !== interaction.member.id) {
                        return interaction.reply({ content: 'Bạn không phải chủ phòng!', ephemeral: true });
                    }
                    await memberChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        Connect: false,
                    });
                    return interaction.reply({ content: 'Phòng đã bị khóa!', ephemeral: true });
                }
                case 'unlock': {
                    if (roomOwner !== interaction.member.id) {
                        return interaction.reply({ content: 'Bạn không phải chủ phòng!', ephemeral: true });
                    }
                    const roleId = '1145746649646383246'; // ID role cần mở quyền
                    await memberChannel.permissionOverwrites.edit(roleId, {
                        Connect: true,
                    });
                    return interaction.reply({ content: `Đã mở room!`, ephemeral: true });
                }
                case 'claim': {
                    const currentOwner = roomOwners.get(memberChannel.id);
                    if (!currentOwner) {
                        roomOwners.set(memberChannel.id, interaction.member.id);
                        return interaction.reply({ content: 'Bạn đã trở thành chủ phòng!', ephemeral: true });
                    }

                    const ownerMember = interaction.guild.members.cache.get(currentOwner);
                    if (!ownerMember || !ownerMember.voice.channel || ownerMember.voice.channel.id !== memberChannel.id) {
                        roomOwners.set(memberChannel.id, interaction.member.id);
                        return interaction.reply({ content: 'Chủ phòng đã rời đi, bạn đã trở thành chủ phòng!', ephemeral: true });
                    }

                    return interaction.reply({ content: 'Phòng này đã có chủ!', ephemeral: true });
                }
                case 'kick': {
                    const user = interaction.options.getUser('user');
                    const memberToKick = memberChannel.members.get(user.id);
                    if (!memberToKick) {
                        return interaction.reply({ content: 'Người dùng không có trong phòng!', ephemeral: true });
                    }
                    if (roomOwner !== interaction.member.id) {
                        return interaction.reply({ content: 'Bạn không phải chủ phòng!', ephemeral: true });
                    }
                    await memberToKick.voice.setChannel(null);
                    return interaction.reply({ content: `Đã đuổi **${user.username}** khỏi phòng!`, ephemeral: true });
                }
                case 'allow': {
                    const user = interaction.options.getUser('user');
                    if (roomOwner !== interaction.member.id) {
                        return interaction.reply({ content: 'Bạn không phải chủ phòng!', ephemeral: true });
                    }
                    await memberChannel.permissionOverwrites.create(user.id, {
                        Connect: true,
                    });
                    return interaction.reply({ content: `Đã cho phép **${user.username}** vào phòng!`, ephemeral: true });
                }
                case 'info': {
                    const embed = new EmbedBuilder()
                        .setTitle('📜 Thông tin phòng')
                        .setDescription(`Tên phòng: **${memberChannel.name}**\n` +
                            `Chủ phòng: <@${roomOwner || 'chưa có'}>\n` +
                            `Thành viên: ${memberChannel.members.size}`)
                        .setColor(0x00FF7F)
                        .setFooter({ text: `Channel ID: ${memberChannel.id}` })
                        .setTimestamp();

                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }
        }

        if (interaction.isButton()) {
            if (customId === 'commands_list') {
                const embed = new EmbedBuilder()
                    .setTitle('📜 **Danh sách các lệnh khả dụng**')
                    .setDescription(
                        `🔧 **Quản lý phòng:**\n` +
                        `- \`/rename [tên mới]\`: Đổi tên phòng.\n` +
                        `- \`/lock\`: Khóa phòng để người khác không vào được.\n` +
                        `- \`/unlock\`: Mở khóa phòng để role cụ thể vào được.\n` +
                        `- \`/claim\`: Làm chủ phòng nếu không có chủ.\n\n` +
                        `👥 **Quản lý thành viên:**\n` +
                        `- \`/kick [người dùng]\`: Đuổi người dùng ra khỏi phòng.\n` +
                        `- \`/allow [người dùng]\`: Cho phép người dùng vào phòng.\n\n` +
                        `ℹ️ **Thông tin phòng:**\n` +
                        `- \`/info\`: Hiển thị thông tin phòng hiện tại.`
                    )
                    .setColor(0x00FF7F)
                    .setFooter({ text: 'Hệ thống quản lý phòng tự động', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (customId === 'check_dj') {
                const guild = interaction.guild;
                const allVoiceChannels = guild.channels.cache.filter(channel => channel.type === 2);

                let botsInUse = [];
                let botsFree = [];

                for (const botId of ['906422339674189835', '489076647727857685', '239631525350604801']) {
                    let botFound = false;

                    for (const [channelId, channel] of allVoiceChannels) {
                        if (channel.members.has(botId)) {
                            botFound = true;
                            if (channel.id !== memberChannel.id) {
                                botsInUse.push(`<@${botId}> trong **${channel.name}**`);
                            }
                        }
                    }

                    if (!botFound) {
                        botsFree.push(`<@${botId}>`);
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎵 **DJ Bot Status**')
                    .setDescription(
                        `🎧 **Bot đang hoạt động:**\n` +
                        `${botsInUse.length > 0 ? botsInUse.join('\n') : 'Không có bot nào đang hoạt động.'}\n\n` +
                        `✅ **Bot sẵn sàng:**\n` +
                        `${botsFree.length > 0 ? botsFree.join(', ') : 'Tất cả bot đều đang bận.'}`
                    )
                    .setColor(0x00FF7F)
                    .setFooter({ text: 'Cập nhật tình trạng bot DJ', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    } catch (error) {
        console.error(`Lỗi khi xử lý:`, error);
        return interaction.reply({ content: 'Đã xảy ra lỗi khi xử lý yêu cầu.', ephemeral: true });
    }
});

// Xóa kênh trống định kỳ
setInterval(() => {
    deleteEmptyChannels(VOICE_CATEGORY_ID);
}, 60000);

client.login(process.env.DISCORD_TOKEN);
