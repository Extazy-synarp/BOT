require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// 🌐 SERVEUR API + BOT DISCORD - SYSTÈME COMPLET (TEMPS RÉEL)
// ═══════════════════════════════════════════════════════════════
// 🤖 Créé par Extazy - RASCA Management System v2.0
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════
// 🔧 CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    ROLE_COMMAND_ID: '1416708338795806791',
    ROLE_OP_ID: '1416708338795806791',
    LOG_CHANNEL_15H: '1402560110693191815',
    LOG_CHANNEL_21H: '1438825375240159232',
    PREFIX: '!',
    HEURE_SEPARATION: 18,
    API_KEY: 'Lune',
    ALLOWED_GUILD_ID: null,
    
    // Système de rappels automatiques
    RAPPEL_AUTO_ACTIVE: true,
    RAPPEL_INTERVALLE: 10 * 60 * 1000,
    RAPPEL_MESSAGE_15H: '⏰ **Rappel (15H00) :** {mentions} - Merci de réagir pour l\'opération de 15H ! 🙏',
    RAPPEL_MESSAGE_21H: '⏰ **Rappel (21H00) :** {mentions} - Merci de réagir pour l\'opération de 21H ! 🙏',
    RAPPEL_MESSAGE_CUSTOM: '⏰ **Rappel ({heure}) :** {mentions} - Merci de confirmer votre présence ! 🙏'
};

const REACTIONS = {
    PRESENT: '✅',
    ABSENT: '❌',
    RETARD: '⏰'
};

const activeOperations = new Map();
const logs15h = [];
const logs21h = [];

// ═══════════════════════════════════════════════════════════════
// 🤖 INITIALISATION DU BOT DISCORD
// ═══════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

let botReady = false;

client.once('ready', () => {
    console.log(`✅ Bot connecté: ${client.user.tag}`);
    console.log(`🌐 Serveur API démarré sur le port ${PORT}`);
    console.log(`🛡️ Système de présence opérationnelle activé`);
    console.log(`👑 Créé par Extazy - RASCA Management System`);
    botReady = true;
    
    const guild = client.guilds.cache.first();
    if (guild) {
        CONFIG.ALLOWED_GUILD_ID = guild.id;
        console.log(`🎯 Serveur configuré: ${guild.name}`);
    }
    
    client.user.setActivity('les opérations RASCA', { type: 'WATCHING' });
});

// ═══════════════════════════════════════════════════════════════
// 📅 FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════

function getDateString(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const jour = date.getDate().toString().padStart(2, '0');
    const mois = (date.getMonth() + 1).toString().padStart(2, '0');
    const annee = date.getFullYear();
    return `${jour}/${mois}/${annee}`;
}

function getLogChannel(heure) {
    const heureNum = parseInt(heure.split(':')[0]);
    return heureNum < CONFIG.HEURE_SEPARATION ? CONFIG.LOG_CHANNEL_15H : CONFIG.LOG_CHANNEL_21H;
}

function createOperationEmbed(date, heure) {
    return new EmbedBuilder()
        .setColor('#ff4fc3')
        .setTitle('🌸 𝐏𝐑𝐄𝐒𝐄𝐍𝐂𝐄 𝐎𝐏𝐄𝐑𝐀𝐓𝐈𝐎𝐍 𝐑𝐀𝐒𝐂𝐀 💪')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📅 **Date :** ${date} 🕓 **Heure prévue :** ${heure} 📍 **Lieu :** Villa\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ **Présent** — Disponible et prêt à l'action ! 🔥\n` +
            `⏰ **Retard** — J'arrive dans les 10 prochaines minutes ! 🏃‍♂️\n` +
            `❌ **Absent** — Je ne pourrai pas participer cette fois. 😢\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💗 **Merci de réagir ci-dessous pour confirmer votre présence !**\n` +
            `🔥 On compte sur vous les gars ! Soyez au rendez-vous ! 💪✨\n\n` +
            `⚠️ **Rappel :** La confirmation est **obligatoire** pour tous les membres ! 🎯`
        )
        .setTimestamp()
        .setFooter({
            text: '🤖 Bot créé par Extazy • Système de présence RASCA 🌸',
        });
}

function createLogEmbed(action, user, messageLink, date, heure, details = '') {
    const colors = {
        'CRÉATION D\'OPÉRATION': '#00D9FF',
        'RÉACTION AJOUTÉE': 'Green',
        'RÉACTION RETIRÉE': 'Orange',
        'RAPPEL ENVOYÉ': '#9D4EDD',
        'RAPPELS ARRÊTÉS AUTOMATIQUEMENT': '#FFB800'
    };

    const color = colors[action] || '#5865F2';

    if (action === 'RÉACTION AJOUTÉE' || action === 'RÉACTION RETIRÉE') {
        const now = new Date();
        const jour = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const heureNow = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        
        const embed = new EmbedBuilder()
            .setColor(action === 'RÉACTION AJOUTÉE' ? 'Green' : 'Orange')
            .setTitle(action === 'RÉACTION AJOUTÉE' 
                ? `📥 Réaction ajoutée (${heure || '?'})` 
                : `📤 Réaction retirée (${heure || '?'})`)
            .setDescription(
                `👤 **Utilisateur :** <@${user.id}>\n` +
                `💬 **Réaction :** ${details || 'Non spécifiée'}\n` +
                `🕓 **Heure :** ${jour} à ${heureNow}\n` +
                `📌 **Présence concernée :** ${heure || 'Inconnue'}`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID : ${user.id} • Par Extazy` });
        
        return embed;
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: 'SYSTÈME DE LOGS OPÉRATIONNELS', iconURL: user.displayAvatarURL() })
        .setTitle(`📊 ${action}`)
        .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            { 
                name: '👤 ┃ UTILISATEUR', 
                value: `\`\`\`\n${user.tag}\n\`\`\`\n**ID :** \`${user.id}\``, 
                inline: true 
            },
            { 
                name: '📅 ┃ DATE', 
                value: `\`\`\`\n${date}\n\`\`\``, 
                inline: true 
            },
            { 
                name: '🕐 ┃ HEURE', 
                value: `\`\`\`\n${heure}\n\`\`\``, 
                inline: true 
            }
        )
        .setTimestamp();

    if (messageLink) {
        embed.addFields({ 
            name: '🔗 ┃ LIEN DU MESSAGE', 
            value: `[➜ Accéder à l'opération](${messageLink})`,
            inline: false
        });
    }

    if (details) {
        embed.addFields({ 
            name: 'ℹ️ ┃ INFORMATIONS COMPLÉMENTAIRES', 
            value: `\`\`\`yaml\n${details}\n\`\`\``,
            inline: false
        });
    }

    embed.setFooter({ 
        text: `Log enregistré • ${action} • Par Extazy`, 
        iconURL: user.displayAvatarURL() 
    });

    return embed;
}

async function sendLog(guild, heure, embed) {
    try {
        const logChannelId = getLogChannel(heure);
        const logChannel = await guild.channels.fetch(logChannelId);
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Erreur lors de l\'envoi du log:', error);
    }
}

async function getOperationStats(message) {
    const stats = {
        present: 0,
        absent: 0,
        retard: 0,
        total: 0
    };

    for (const [emoji, reaction] of message.reactions.cache) {
        const users = await reaction.users.fetch();
        const count = users.filter(u => !u.bot).size;
        
        if (emoji === REACTIONS.PRESENT) stats.present = count;
        if (emoji === REACTIONS.ABSENT) stats.absent = count;
        if (emoji === REACTIONS.RETARD) stats.retard = count;
    }

    stats.total = stats.present + stats.absent + stats.retard;
    return stats;
}

// ═══════════════════════════════════════════════════════════════
// 📋 SYSTÈME DE LOGS
// ═══════════════════════════════════════════════════════════════

function addLog(heure, type, data) {
    const log = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: type,
        ...data
    };

    const heureNum = parseInt(heure.split(':')[0]);
    if (heureNum < CONFIG.HEURE_SEPARATION) {
        logs15h.unshift(log);
        if (logs15h.length > 500) logs15h.pop();
    } else {
        logs21h.unshift(log);
        if (logs21h.length > 500) logs21h.pop();
    }

    io.emit('newLog', { log, category: heureNum < CONFIG.HEURE_SEPARATION ? '15h' : '21h' });
}

// ═══════════════════════════════════════════════════════════════
// 🕐 FONCTION DE PARSING DE DATE/HEURE
// ═══════════════════════════════════════════════════════════════

function parseOperationDateTime(dateStr, heureStr) {
    try {
        // Parse la date au format DD/MM/YYYY
        const [jour, mois, annee] = dateStr.split('/').map(Number);
        
        // Parse l'heure au format HH:MM
        const [heures, minutes] = heureStr.split(':').map(Number);
        
        // Crée un objet Date
        const operationDate = new Date(annee, mois - 1, jour, heures, minutes, 0, 0);
        
        return operationDate;
    } catch (error) {
        console.error('Erreur lors du parsing de la date/heure:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// ⏰ SYSTÈME DE RAPPELS AUTOMATIQUES
// ═══════════════════════════════════════════════════════════════

async function startAutoReminder(messageId) {
    if (!CONFIG.RAPPEL_AUTO_ACTIVE) return;

    const opData = activeOperations.get(messageId);
    if (!opData) return;

    // Calculer la date/heure de fin des rappels (heure de l'opération + 1 minute)
    const operationDateTime = parseOperationDateTime(opData.date, opData.heure);
    if (!operationDateTime) {
        console.error('❌ Impossible de parser la date/heure de l\'opération');
        return;
    }

    // Ajouter 1 minute à l'heure de l'opération
    const endReminderTime = new Date(operationDateTime.getTime() + 60 * 1000);
    const timeUntilEnd = endReminderTime.getTime() - Date.now();

    console.log(`⏰ Opération prévue le ${opData.date} à ${opData.heure}`);
    console.log(`⏹️ Les rappels s'arrêteront automatiquement à ${endReminderTime.toLocaleString('fr-FR')}`);
    console.log(`⏱️ Temps restant: ${Math.floor(timeUntilEnd / 1000 / 60)} minutes`);

    // Si l'heure de fin est déjà passée, ne pas démarrer les rappels
    if (timeUntilEnd <= 0) {
        console.log('⚠️ L\'heure de l\'opération est déjà passée. Rappels non démarrés.');
        return;
    }

    const sendReminder = async () => {
        try {
            // Vérifier si on a dépassé l'heure de fin
            if (Date.now() >= endReminderTime.getTime()) {
                console.log(`⏹️ Heure de l'opération atteinte. Arrêt automatique des rappels pour ${opData.heure}`);
                await stopAutoReminderWithLog(messageId, 'Heure de l\'opération atteinte');
                return;
            }

            const guild = await client.guilds.fetch(opData.guildId);
            const channel = await guild.channels.fetch(opData.channelId);
            const presenceMsg = await channel.messages.fetch(messageId);

            const role = await guild.roles.fetch(CONFIG.ROLE_OP_ID);
            if (!role) {
                console.log('⚠️ Rôle non trouvé pour les rappels');
                return;
            }

            let membersWithRole;
            try {
                membersWithRole = role.members.filter(m => !m.user.bot);
                
                if (membersWithRole.size === 0) {
                    console.log('📥 Récupération des membres du serveur...');
                    const members = await guild.members.fetch({ 
                        force: false,
                        time: 15000
                    }).catch(err => {
                        console.error('⚠️ Impossible de récupérer tous les membres:', err.message);
                        return guild.members.cache;
                    });
                    
                    membersWithRole = members.filter(m => m.roles.cache.has(CONFIG.ROLE_OP_ID) && !m.user.bot);
                }
            } catch (error) {
                console.error('❌ Erreur lors de la récupération des membres:', error.message);
                membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(CONFIG.ROLE_OP_ID) && !m.user.bot);
            }

            if (membersWithRole.size === 0) {
                console.log('⚠️ Aucun membre trouvé avec le rôle');
                return;
            }

            await Promise.all(presenceMsg.reactions.cache.map(r => r.users.fetch().catch(() => new Map())));

            const reactedUsers = new Set();
            for (const reaction of presenceMsg.reactions.cache.values()) {
                reaction.users.cache.forEach(u => {
                    if (!u.bot) reactedUsers.add(u.id);
                });
            }

            const notReacted = membersWithRole.filter(m => !reactedUsers.has(m.id));

            if (notReacted.size === 0) {
                console.log(`✅ Tous les membres ont réagi pour l'opération ${opData.heure}. Arrêt des rappels.`);
                await stopAutoReminderWithLog(messageId, 'Tous les membres ont réagi');
                return;
            }

            const pingList = notReacted.map(m => `<@${m.id}>`).join(' | ');

            let reminderText;
            if (opData.heure === '15:00') {
                reminderText = CONFIG.RAPPEL_MESSAGE_15H.replace('{mentions}', pingList);
            } else if (opData.heure === '21:00') {
                reminderText = CONFIG.RAPPEL_MESSAGE_21H.replace('{mentions}', pingList);
            } else {
                reminderText = CONFIG.RAPPEL_MESSAGE_CUSTOM
                    .replace('{mentions}', pingList)
                    .replace('{heure}', opData.heure);
            }

            const reminderMsg = await presenceMsg.reply({
                content: reminderText,
                allowedMentions: { users: notReacted.map(m => m.id) }
            });

            if (opData.lastReminderMsg) {
                await opData.lastReminderMsg.delete().catch(() => {});
            }

            opData.lastReminderMsg = reminderMsg;
            activeOperations.set(messageId, opData);

            console.log(`⏰ Rappel automatique envoyé pour l'opération ${opData.heure} (${notReacted.size} membre(s))`);

        } catch (error) {
            console.error(`❌ Erreur lors du rappel automatique:`, error);
        }
    };

    // Premier rappel après 5 secondes
    setTimeout(sendReminder, 5000);
    
    // Rappels réguliers
    const interval = setInterval(sendReminder, CONFIG.RAPPEL_INTERVALLE);

    // Timeout pour arrêter automatiquement les rappels à l'heure de l'opération + 1 min
    const autoStopTimeout = setTimeout(async () => {
        console.log(`⏹️ Arrêt automatique des rappels pour l'opération ${opData.heure} (heure atteinte)`);
        await stopAutoReminderWithLog(messageId, 'Heure de l\'opération atteinte');
    }, timeUntilEnd);

    opData.reminderInterval = interval;
    opData.autoStopTimeout = autoStopTimeout;
    opData.endReminderTime = endReminderTime.toISOString();
    activeOperations.set(messageId, opData);

    console.log(`🔄 Système de rappels automatiques démarré pour l'opération ${opData.heure}`);
}

async function stopAutoReminderWithLog(messageId, reason = 'Manuel') {
    const opData = activeOperations.get(messageId);
    if (opData && opData.reminderInterval) {
        clearInterval(opData.reminderInterval);
        opData.reminderInterval = null;
        
        if (opData.autoStopTimeout) {
            clearTimeout(opData.autoStopTimeout);
            opData.autoStopTimeout = null;
        }
        
        activeOperations.set(messageId, opData);

        // Envoyer un log si arrêt automatique
        if (reason === 'Heure de l\'opération atteinte' || reason === 'Tous les membres ont réagi') {
            try {
                const guild = await client.guilds.fetch(opData.guildId);
                const logEmbed = new EmbedBuilder()
                    .setColor('#FFB800')
                    .setTitle('⏹️ RAPPELS ARRÊTÉS AUTOMATIQUEMENT')
                    .setDescription(
                        `**Opération :** ${opData.date} à ${opData.heure}\n` +
                        `**Raison :** ${reason}\n` +
                        `**Heure d'arrêt :** ${new Date().toLocaleString('fr-FR')}`
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Système automatique • Par Extazy' });

                await sendLog(guild, opData.heure, logEmbed);

                addLog(opData.heure, 'RAPPELS_ARRETES_AUTO', {
                    operation: {
                        messageId: messageId,
                        date: opData.date,
                        heure: opData.heure
                    },
                    reason: reason,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Erreur lors de l\'envoi du log d\'arrêt:', error);
            }
        }

        console.log(`⏹️ Système de rappels automatiques arrêté pour l'opération ${opData.heure} (${reason})`);
    }
}

function stopAutoReminder(messageId) {
    const opData = activeOperations.get(messageId);
    if (opData && opData.reminderInterval) {
        clearInterval(opData.reminderInterval);
        opData.reminderInterval = null;
        
        if (opData.autoStopTimeout) {
            clearTimeout(opData.autoStopTimeout);
            opData.autoStopTimeout = null;
        }
        
        activeOperations.set(messageId, opData);
        console.log(`⏹️ Système de rappels automatiques arrêté pour l'opération ${opData.heure}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 ÉVÉNEMENTS DISCORD EN TEMPS RÉEL
// ═══════════════════════════════════════════════════════════════

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();

        const opData = activeOperations.get(reaction.message.id);
        if (!opData) return;

        const validEmojis = Object.values(REACTIONS);
        if (!validEmojis.includes(reaction.emoji.name)) {
            await reaction.users.remove(user).catch(() => {});
            return;
        }

        await reaction.users.remove(client.user).catch(() => {});

        for (const emoji of validEmojis) {
            if (emoji !== reaction.emoji.name) {
                const otherReaction = reaction.message.reactions.cache.get(emoji);
                if (otherReaction) {
                    await otherReaction.users.remove(user).catch(() => {});
                }
            }
        }

        const stats = await getOperationStats(reaction.message);

        const emojiLabels = {
            [REACTIONS.PRESENT]: 'Présent',
            [REACTIONS.ABSENT]: 'Absent',
            [REACTIONS.RETARD]: 'En retard'
        };

        const guild = await client.guilds.fetch(opData.guildId);
        const logEmbed = createLogEmbed(
            'RÉACTION AJOUTÉE',
            user,
            reaction.message.url,
            opData.date,
            opData.heure,
            emojiLabels[reaction.emoji.name]
        );
        await sendLog(guild, opData.heure, logEmbed);

        addLog(opData.heure, 'REACTION_ADDED', {
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                avatar: user.displayAvatarURL()
            },
            operation: {
                messageId: reaction.message.id,
                date: opData.date,
                heure: opData.heure
            },
            reaction: {
                emoji: reaction.emoji.name,
                label: emojiLabels[reaction.emoji.name]
            }
        });

        io.emit('reactionAdded', {
            messageId: reaction.message.id,
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.displayAvatarURL(),
            emoji: reaction.emoji.name,
            stats: stats,
            timestamp: new Date().toISOString()
        });

        console.log(`🔴 [TEMPS RÉEL] Réaction ajoutée : ${user.username} → ${reaction.emoji.name}`);

    } catch (error) {
        console.error('Erreur réaction ajoutée:', error);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();

        const opData = activeOperations.get(reaction.message.id);
        if (!opData) return;

        const validEmojis = Object.values(REACTIONS);
        if (!validEmojis.includes(reaction.emoji.name)) return;

        const userReactions = await reaction.users.fetch();
        const hasUserReactions = userReactions.some(u => !u.bot);
        if (!hasUserReactions) {
            await reaction.message.react(reaction.emoji.name).catch(() => {});
        }

        const stats = await getOperationStats(reaction.message);

        const emojiLabels = {
            [REACTIONS.PRESENT]: 'Présent',
            [REACTIONS.ABSENT]: 'Absent',
            [REACTIONS.RETARD]: 'En retard'
        };

        const guild = await client.guilds.fetch(opData.guildId);
        const logEmbed = createLogEmbed(
            'RÉACTION RETIRÉE',
            user,
            reaction.message.url,
            opData.date,
            opData.heure,
            emojiLabels[reaction.emoji.name]
        );
        await sendLog(guild, opData.heure, logEmbed);

        addLog(opData.heure, 'REACTION_REMOVED', {
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                avatar: user.displayAvatarURL()
            },
            operation: {
                messageId: reaction.message.id,
                date: opData.date,
                heure: opData.heure
            },
            reaction: {
                emoji: reaction.emoji.name,
                label: emojiLabels[reaction.emoji.name]
            }
        });

        io.emit('reactionRemoved', {
            messageId: reaction.message.id,
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.displayAvatarURL(),
            emoji: reaction.emoji.name,
            stats: stats,
            timestamp: new Date().toISOString()
        });

        console.log(`🔵 [TEMPS RÉEL] Réaction retirée : ${user.username} → ${reaction.emoji.name}`);

    } catch (error) {
        console.error('Erreur réaction retirée:', error);
    }
});

// ═══════════════════════════════════════════════════════════════
// 💬 COMMANDES DISCORD
// ═══════════════════════════════════════════════════════════════

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'help' || command === 'aide' || command === 'commands') {
        const hasPermission = message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID);
        
        const helpEmbed = new EmbedBuilder()
            .setColor('#ff4fc3')
            .setAuthor({ 
                name: 'CENTRE D\'AIDE - BOT PRÉSENCE RASCA', 
                iconURL: client.user.displayAvatarURL() 
            })
            .setTitle('📚 LISTE DES COMMANDES DISPONIBLES')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                '**Voici toutes les commandes disponibles.**\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .addFields(
                {
                    name: '🌸 ┃ GESTION DES PRÉSENCES',
                    value: 
                        '> **`!presence`** ou **`!op`**\n' +
                        '> Crée une nouvelle opération.\n' +
                        (hasPermission ? '> ✅ Accessible' : '> 🔒 Rôle requis'),
                    inline: false
                },
                {
                    name: '⏰ ┃ RAPPELS',
                    value: 
                        '> **`!rappel <ID>`** - Rappel manuel\n' +
                        '> **`!stoprappel <ID>`** - Arrêter rappels\n' +
                        '> ℹ️ Les rappels s\'arrêtent automatiquement à l\'heure de l\'opération + 1 min\n' +
                        (hasPermission ? '> ✅ Accessible' : '> 🔒 Rôle requis'),
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: '🤖 Bot créé par Extazy • Système RASCA 🌸', 
                iconURL: message.author.displayAvatarURL() 
            });

        return message.reply({ embeds: [helpEmbed] });
    }

    if (command === 'presence' || command === 'op') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            return message.reply('❌ Permission refusée.');
        }

        const dateMenu = new StringSelectMenuBuilder()
            .setCustomId('select_date')
            .setPlaceholder('📅 Choisir une date')
            .addOptions([
                { label: 'Aujourd\'hui', description: getDateString(0), value: 'today', emoji: '📅' },
                { label: 'Demain', description: getDateString(1), value: 'tomorrow', emoji: '📆' }
            ]);

        const row1 = new ActionRowBuilder().addComponents(dateMenu);
        const setupEmbed = new EmbedBuilder()
            .setColor('#00D9FF')
            .setTitle('🛡️ CONFIGURATION DE L\'OPÉRATION')
            .setDescription('**Étape 1/2 : Sélection de la date**')
            .setTimestamp();

        const setupMessage = await message.reply({ embeds: [setupEmbed], components: [row1] });
        const dateCollector = setupMessage.createMessageComponentCollector({ time: 120000 });

        dateCollector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ Seul l\'auteur peut interagir.', ephemeral: true });
            }

            const selectedDate = i.values[0] === 'today' ? getDateString(0) : getDateString(1);
            dateCollector.stop();

            const heureMenu = new StringSelectMenuBuilder()
                .setCustomId('select_heure')
                .setPlaceholder('🕐 Choisir une heure')
                .addOptions([
                    { label: '15h00', value: '15:00', emoji: '🕒' },
                    { label: '21h00', value: '21:00', emoji: '🕘' },
                    { label: 'Heure personnalisée', value: 'custom', emoji: '⏰' }
                ]);

            const row2 = new ActionRowBuilder().addComponents(heureMenu);
            const heureEmbed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setTitle('🛡️ CONFIGURATION DE L\'OPÉRATION')
                .setDescription(`**Date :** ${selectedDate}\n\n**Étape 2/2 : Sélection de l'heure**`)
                .setTimestamp();

            await i.update({ embeds: [heureEmbed], components: [row2] });
            const heureCollector = setupMessage.createMessageComponentCollector({ time: 120000 });

            heureCollector.on('collect', async (i2) => {
                if (i2.user.id !== message.author.id) {
                    return i2.reply({ content: '❌ Seul l\'auteur peut interagir.', ephemeral: true });
                }

                heureCollector.stop();
                let selectedHeure = i2.values[0];

                if (selectedHeure === 'custom') {
                    await i2.reply({ content: '⏰ Entrez l\'heure (HH:MM):', ephemeral: true });
                    
                    const filter = m => m.author.id === message.author.id && /^\d{1,2}:\d{2}$/.test(m.content);
                    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
                        .catch(() => null);

                    if (!collected) {
                        await setupMessage.edit({ content: '❌ Temps écoulé.', embeds: [], components: [] });
                        return;
                    }

                    selectedHeure = collected.first().content;
                    await collected.first().delete().catch(() => {});
                } else {
                    await i2.deferUpdate();
                }

                const opEmbed = createOperationEmbed(selectedDate, selectedHeure);
                await setupMessage.delete().catch(() => {});
                
                const opMessage = await message.channel.send({
                    content: `<@&${CONFIG.ROLE_OP_ID}>`,
                    embeds: [opEmbed]
                });

                await opMessage.react(REACTIONS.PRESENT);
                await opMessage.react(REACTIONS.ABSENT);
                await opMessage.react(REACTIONS.RETARD);

                activeOperations.set(opMessage.id, {
                    date: selectedDate,
                    heure: selectedHeure,
                    channelId: message.channel.id,
                    guildId: message.guild.id,
                    reminderInterval: null,
                    autoStopTimeout: null,
                    lastReminderMsg: null
                });

                addLog(selectedHeure, 'OPERATION_CREATED', {
                    user: {
                        id: message.author.id,
                        username: message.author.username,
                        tag: message.author.tag,
                        avatar: message.author.displayAvatarURL()
                    },
                    operation: {
                        messageId: opMessage.id,
                        date: selectedDate,
                        heure: selectedHeure
                    },
                    channel: {
                        id: message.channel.id,
                        name: message.channel.name
                    }
                });

                if (CONFIG.RAPPEL_AUTO_ACTIVE) {
                    await startAutoReminder(opMessage.id);
                }

                io.emit('operationCreated', {
                    messageId: opMessage.id,
                    date: selectedDate,
                    heure: selectedHeure,
                    channelName: message.channel.name,
                    messageUrl: opMessage.url
                });
            });
        });
    }

    if (command === 'clear' || command === 'purge') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            return message.reply('❌ Permission refusée.');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ Permission manquante.');
        }

        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFB800')
            .setTitle('⚠️ CONFIRMATION')
            .setDescription('**Supprimer TOUS les messages ?**')
            .setTimestamp();

        const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
        await confirmMsg.react('✅');
        await confirmMsg.react('❌');

        const filter = (reaction, user) => ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        const collector = confirmMsg.createReactionCollector({ filter, max: 1, time: 30000 });

        collector.on('collect', async (reaction) => {
            if (reaction.emoji.name === '❌') {
                await confirmMsg.edit({ content: '✅ Annulé.', embeds: [] });
                await confirmMsg.reactions.removeAll().catch(() => {});
                return;
            }

            let totalDeleted = 0;
            let hasMoreMessages = true;

            while (hasMoreMessages) {
                const fetchedMessages = await message.channel.messages.fetch({ limit: 100 });
                if (fetchedMessages.size === 0) break;

                const now = Date.now();
                const twoWeeks = 14 * 24 * 60 * 60 * 1000;
                
                const recentMessages = fetchedMessages.filter(msg => now - msg.createdTimestamp < twoWeeks);
                const oldMessages = fetchedMessages.filter(msg => now - msg.createdTimestamp >= twoWeeks);

                if (recentMessages.size > 0) {
                    await message.channel.bulkDelete(recentMessages, true);
                    totalDeleted += recentMessages.size;
                }

                for (const [, oldMsg] of oldMessages) {
                    try {
                        await oldMsg.delete();
                        totalDeleted++;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error('Erreur:', error);
                    }
                }

                if (fetchedMessages.size < 100) hasMoreMessages = false;
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF94')
                .setTitle('✅ SUCCÈS')
                .setDescription(`**${totalDeleted} messages supprimés.**`)
                .setTimestamp();

            await confirmMsg.edit({ embeds: [successEmbed] });
            setTimeout(() => confirmMsg.delete().catch(() => {}), 10000);
        });
    }

    if (command === 'rappel' || command === 'reminder') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            return message.reply('❌ Permission refusée.');
        }

        const messageId = args[0];
        if (!messageId) return message.reply('❌ ID manquant.');

        const opData = activeOperations.get(messageId);
        if (!opData) return message.reply('❌ Opération non trouvée.');

        try {
            const channel = await client.channels.fetch(opData.channelId);
            const opMessage = await channel.messages.fetch(messageId);
            const role = await message.guild.roles.fetch(CONFIG.ROLE_OP_ID);
            const membersWithRole = role.members;

            const reactedUsers = new Set();
            for (const emoji of Object.values(REACTIONS)) {
                const reaction = opMessage.reactions.cache.get(emoji);
                if (reaction) {
                    const users = await reaction.users.fetch();
                    users.forEach(user => {
                        if (!user.bot) reactedUsers.add(user.id);
                    });
                }
            }

            const noReaction = membersWithRole.filter(member => !reactedUsers.has(member.id));
            if (noReaction.size === 0) return message.reply('✅ Tous ont réagi !');

            const reminderEmbed = new EmbedBuilder()
                .setColor('#9D4EDD')
                .setTitle('🔔 RAPPEL')
                .setDescription(
                    `**Opération :** ${opData.date} à ${opData.heure}\n\n` +
                    `[➜ Confirmer](${opMessage.url})`
                )
                .setTimestamp();

            let sent = 0, failed = 0;
            for (const [, member] of noReaction) {
                try {
                    await member.send({ embeds: [reminderEmbed] });
                    sent++;
                } catch {
                    failed++;
                }
            }

            await message.reply(`📨 ${sent} envoyés, ${failed} échecs.`);
        } catch (error) {
            message.reply('❌ Erreur.');
        }
    }

    if (command === 'stoprappel' || command === 'stopreminder') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            return message.reply('❌ Permission refusée.');
        }

        const messageId = args[0];
        if (!messageId) return message.reply('❌ ID manquant.');

        const opData = activeOperations.get(messageId);
        if (!opData) return message.reply('❌ Opération non trouvée.');

        stopAutoReminder(messageId);
        await message.reply(`⏹️ Rappels arrêtés.`);
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔌 SOCKET.IO
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log(`🟢 Client connecté: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔴 Client déconnecté: ${socket.id}`);
    });
});

// ═══════════════════════════════════════════════════════════════
// 🔧 MIDDLEWARE EXPRESS
// ═══════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey !== CONFIG.API_KEY) {
        return res.status(401).json({ success: false, error: 'Clé API invalide' });
    }
    next();
};

const checkBotReady = (req, res, next) => {
    if (!botReady) {
        return res.status(503).json({ success: false, error: 'Bot non connecté' });
    }
    next();
};

// ═══════════════════════════════════════════════════════════════
// 🌐 ROUTES API
// ═══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/info', authenticate, checkBotReady, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(CONFIG.ALLOWED_GUILD_ID);
        res.json({
            success: true,
            data: {
                bot: {
                    username: client.user.username,
                    id: client.user.id,
                    avatar: client.user.displayAvatarURL(),
                    status: 'online'
                },
                guild: {
                    name: guild?.name || 'N/A',
                    id: guild?.id || 'N/A',
                    memberCount: guild?.memberCount || 0,
                    icon: guild?.iconURL() || null
                },
                stats: {
                    activeOperations: activeOperations.size,
                    uptime: Math.floor(client.uptime / 1000),
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/channels', authenticate, checkBotReady, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(CONFIG.ALLOWED_GUILD_ID);
        if (!guild) return res.status(404).json({ success: false, error: 'Serveur non trouvé' });

        const channels = guild.channels.cache
            .filter(ch => ch.isTextBased() && !ch.isThread())
            .map(ch => ({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                category: ch.parent?.name || 'Sans catégorie'
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({ success: true, data: channels });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/operation/create', authenticate, checkBotReady, async (req, res) => {
    try {
        const { channelId, date, heure } = req.body;
        if (!channelId || !date || !heure) {
            return res.status(400).json({ success: false, error: 'Paramètres manquants' });
        }

        const guild = client.guilds.cache.get(CONFIG.ALLOWED_GUILD_ID);
        const channel = await guild.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ success: false, error: 'Canal non trouvé' });

        const embed = createOperationEmbed(date, heure);
        const message = await channel.send({
            content: `<@&${CONFIG.ROLE_OP_ID}>`,
            embeds: [embed]
        });

        await message.react(REACTIONS.PRESENT);
        await message.react(REACTIONS.ABSENT);
        await message.react(REACTIONS.RETARD);

        activeOperations.set(message.id, {
            date, heure, channelId, guildId: guild.id,
            createdAt: new Date().toISOString(),
            messageUrl: message.url
        });

        addLog(heure, 'OPERATION_CREATED', {
            user: { id: 'API', username: 'Système Web', tag: 'Web API', avatar: null },
            operation: { messageId: message.id, date, heure },
            channel: { id: channelId, name: channel.name }
        });

        if (CONFIG.RAPPEL_AUTO_ACTIVE) await startAutoReminder(message.id);

        io.emit('operationCreated', {
            messageId: message.id, date, heure,
            channelName: channel.name, messageUrl: message.url
        });

        res.json({
            success: true,
            data: { messageId: message.id, messageUrl: message.url, channelName: channel.name, date, heure }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/operations', authenticate, checkBotReady, async (req, res) => {
    try {
        const operations = [];
        for (const [messageId, opData] of activeOperations.entries()) {
            try {
                const guild = client.guilds.cache.get(opData.guildId);
                const channel = await guild.channels.fetch(opData.channelId);
                const message = await channel.messages.fetch(messageId);
                const stats = await getOperationStats(message);

                operations.push({
                    messageId, date: opData.date, heure: opData.heure,
                    channelName: channel.name, channelId: channel.id,
                    messageUrl: opData.messageUrl, createdAt: opData.createdAt, stats
                });
            } catch (error) {
                console.error(`Erreur opération ${messageId}:`, error);
            }
        }
        res.json({ success: true, data: operations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/operation/:messageId', authenticate, checkBotReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const opData = activeOperations.get(messageId);
        if (!opData) return res.status(404).json({ success: false, error: 'Non trouvée' });

        const guild = client.guilds.cache.get(opData.guildId);
        const channel = await guild.channels.fetch(opData.channelId);
        const message = await channel.messages.fetch(messageId);

        const users = { present: [], absent: [], retard: [], noResponse: [] };
        const role = await guild.roles.fetch(CONFIG.ROLE_OP_ID);
        const membersWithRole = role.members;
        const reactedUserIds = new Set();

        for (const [emoji, reaction] of message.reactions.cache) {
            const reactionUsers = await reaction.users.fetch();
            for (const user of reactionUsers.values()) {
                if (user.bot) continue;
                reactedUserIds.add(user.id);
                const member = await guild.members.fetch(user.id);
                const userData = {
                    id: user.id, username: user.username,
                    displayName: member.displayName, avatar: user.displayAvatarURL()
                };
                if (emoji === REACTIONS.PRESENT) users.present.push(userData);
                if (emoji === REACTIONS.ABSENT) users.absent.push(userData);
                if (emoji === REACTIONS.RETARD) users.retard.push(userData);
            }
        }

        for (const [, member] of membersWithRole) {
            if (!reactedUserIds.has(member.id)) {
                users.noResponse.push({
                    id: member.id, username: member.user.username,
                    displayName: member.displayName, avatar: member.user.displayAvatarURL()
                });
            }
        }

        res.json({
            success: true,
            data: {
                messageId, date: opData.date, heure: opData.heure,
                channelName: channel.name, messageUrl: opData.messageUrl, users,
                stats: {
                    present: users.present.length, absent: users.absent.length,
                    retard: users.retard.length, noResponse: users.noResponse.length,
                    total: membersWithRole.size
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/operation/:messageId/reminder', authenticate, checkBotReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const opData = activeOperations.get(messageId);
        if (!opData) return res.status(404).json({ success: false, error: 'Non trouvée' });

        const guild = client.guilds.cache.get(opData.guildId);
        const channel = await guild.channels.fetch(opData.channelId);
        const message = await channel.messages.fetch(messageId);
        const role = await guild.roles.fetch(CONFIG.ROLE_OP_ID);
        const membersWithRole = role.members;

        const reactedUsers = new Set();
        for (const reaction of message.reactions.cache.values()) {
            const users = await reaction.users.fetch();
            users.forEach(u => { if (!u.bot) reactedUsers.add(u.id); });
        }

        const notReacted = membersWithRole.filter(m => !reactedUsers.has(m.id));
        if (notReacted.size === 0) {
            return res.json({ success: true, message: 'Tous ont réagi', sent: 0, failed: 0 });
        }

        const reminderEmbed = new EmbedBuilder()
            .setColor('#9D4EDD')
            .setTitle('🔔 RAPPEL')
            .setDescription(`**Opération :** ${opData.date} à ${opData.heure}\n\n[➜ Confirmer](${message.url})`)
            .setTimestamp();

        let sent = 0, failed = 0;
        for (const [, member] of notReacted) {
            try {
                await member.send({ embeds: [reminderEmbed] });
                sent++;
            } catch {
                failed++;
            }
        }

        res.json({ success: true, message: 'Rappels envoyés', sent, failed, total: notReacted.size });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/operation/:messageId', authenticate, checkBotReady, async (req, res) => {
    try {
        const { messageId } = req.params;
        const opData = activeOperations.get(messageId);
        if (!opData) return res.status(404).json({ success: false, error: 'Non trouvée' });

        const guild = client.guilds.cache.get(opData.guildId);
        const channel = await guild.channels.fetch(opData.channelId);
        const message = await channel.messages.fetch(messageId);

        stopAutoReminder(messageId);
        await message.delete();
        activeOperations.delete(messageId);

        io.emit('operationDeleted', { messageId });
        res.json({ success: true, message: 'Supprimée' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/logs/15h', authenticate, checkBotReady, (req, res) => {
    res.json({ success: true, data: logs15h });
});

app.get('/api/logs/21h', authenticate, checkBotReady, (req, res) => {
    res.json({ success: true, data: logs21h });
});

app.delete('/api/logs/:category', authenticate, checkBotReady, (req, res) => {
    const { category } = req.params;
    if (category === '15h') {
        logs15h.length = 0;
    } else if (category === '21h') {
        logs21h.length = 0;
    } else {
        return res.status(400).json({ success: false, error: 'Catégorie invalide' });
    }
    io.emit('logsCleaned', { category });
    res.json({ success: true, message: `Logs ${category} effacés` });
});

// ═══════════════════════════════════════════════════════════════
// 🚀 DÉMARRAGE
// ═══════════════════════════════════════════════════════════════

client.login(CONFIG.TOKEN);

server.listen(PORT, () => {
    console.log(`🌐 Serveur: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: Activé`);
    console.log(`👑 Par Extazy - RASCA System v2.0`);
});