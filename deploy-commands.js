const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = process.env.GUILD_IDS?.split(','); // Danh sách server để triển khai lệnh

const commands = [
    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Đổi tên phòng của bạn')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Tên mới cho phòng')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Khóa phòng để người khác không vào được'),
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Mở khóa phòng để người khác có thể vào'),
    new SlashCommandBuilder()
        .setName('claim')
        .setDescription('Làm chủ phòng nếu phòng không có chủ'),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Đuổi người dùng ra khỏi phòng')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần đuổi')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('allow')
        .setDescription('Cho phép người dùng vào phòng')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần cho phép')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Hiển thị thông tin phòng hiện tại'),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Bắt đầu đăng ký các lệnh Slash...');
        for (const guildId of GUILD_IDS) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, guildId),
                { body: commands.map(command => command.toJSON()) },
            );
            console.log(`Đã đăng ký lệnh cho server: ${guildId}`);
        }
        console.log('Đăng ký lệnh Slash hoàn tất.');
    } catch (error) {
        console.error('Lỗi khi đăng ký lệnh Slash:', error);
    }
})();
