require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// 🛡️ BOT DISCORD - SYSTÈME DE PRÉSENCE OPÉRATIONNELLE
// ═══════════════════════════════════════════════════════════════

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

// ═══════════════════════════════════════════════════════════════
// 🔧 CONFIGURATION - MODIFIEZ CES VALEURS
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    ROLE_COMMAND_ID: '1416708338795806791',  // Rôle autorisé à créer des opérations
    ROLE_OP_ID: '1416708338795806791',      // Rôle à ping lors des opérations
    LOG_CHANNEL_15H: '1435342052060565636', // Salon logs pour ops de 15h
    LOG_CHANNEL_21H: '1402560110693191815', // Salon logs pour ops de 21h
    PREFIX: '!',
    HEURE_SEPARATION: 18,  // Heure de séparation pour logs (< 18h → 15h, ≥ 18h → 21h)
    
    // ⏰ Configuration du système de rappels automatiques
    RAPPEL_AUTO_ACTIVE: true,              // Activer/désactiver les rappels automatiques
    RAPPEL_INTERVALLE: 10 * 60 * 1000,     // Intervalle entre chaque rappel (en millisecondes) - 10 minutes par défaut
    RAPPEL_MESSAGE_15H: '⏰ **Rappel (15H00) :** {mentions} - Merci de réagir pour l\'opération de 15H ! 🙏',
    RAPPEL_MESSAGE_21H: '⏰ **Rappel (21H00) :** {mentions} - Merci de réagir pour l\'opération de 21H ! 🙏',
    RAPPEL_MESSAGE_CUSTOM: '⏰ **Rappel ({heure}) :** {mentions} - Merci de confirmer votre présence ! 🙏'
};

// Émojis de réaction
const REACTIONS = {
    PRESENT: '✅',
    ABSENT: '❌',
    RETARD: '⏰'
};

// Stockage des opérations actives
const activeOperations = new Map(); // messageId → { date, heure, channelId, guildId, reminderInterval, lastReminderMsg }

// ═══════════════════════════════════════════════════════════════
// 🤖 INITIALISATION DU BOT
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
            `📅 **Date :** ${date}  🕓 **Heure prévue :** ${heure}  📍 **Lieu :** Villa\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ **Présent** — Disponible et prêt à l'action ! 🔥\n` +
            `⏰ **Retard** — J'arrive dans les 10 prochaines minutes ! 🏃‍♂️\n` +
            `❌ **Absent** — Je ne pourrai pas participer cette fois. 😢\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💗 **Merci de réagir ci-dessous pour confirmer votre présence !**\n` +
            `🔥 On compte sur vous les gars ! Soyez au rendez-vous ! 💪✨\n\n` +
            `⚠️ **Rappel :** La confirmation est **obligatoire** pour tous les membres ! 🎯`
        )
        .setThumbnail('https://cdn.discordapp.com/attachments/placeholder/villa.png') // Optionnel : image de la villa
        .setTimestamp()
        .setFooter({ 
            text: '🤖 Bot créé par Extazy • Système de présence RASCA 🌸', 
            iconURL: 'https://cdn.discordapp.com/emojis/placeholder.png' 
        });
}

function createLogEmbed(action, user, messageLink, date, heure, details = '') {
    // Couleurs selon le type d'action
    const colors = {
        'CRÉATION D\'OPÉRATION': '#00D9FF',
        'RÉACTION AJOUTÉE': 'Green',
        'RÉACTION RETIRÉE': 'Orange',
        'RAPPEL ENVOYÉ': '#9D4EDD'
    };
    
    const color = colors[action] || '#5865F2';
    
    // Pour les logs de réactions, utiliser le format simplifié
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
            .setFooter({ text: `ID : ${user.id}` });
        
        return embed;
    }
    
    // Pour les autres types de logs (création, rappel)
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
        text: `Log enregistré • ${action}`, 
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

// ═══════════════════════════════════════════════════════════════
// ⏰ SYSTÈME DE RAPPELS AUTOMATIQUES
// ═══════════════════════════════════════════════════════════════

async function startAutoReminder(messageId) {
    if (!CONFIG.RAPPEL_AUTO_ACTIVE) return;

    const opData = activeOperations.get(messageId);
    if (!opData) return;

    const sendReminder = async () => {
        try {
            const guild = await client.guilds.fetch(opData.guildId);
            const channel = await guild.channels.fetch(opData.channelId);
            const presenceMsg = await channel.messages.fetch(messageId);

            // Récupérer le rôle
            const role = await guild.roles.fetch(CONFIG.ROLE_OP_ID);
            if (!role) {
                console.log('⚠️ Rôle non trouvé pour les rappels');
                return;
            }

            // Récupérer les membres avec le rôle (avec timeout augmenté et cache)
            let membersWithRole;
            try {
                // Essayer d'utiliser le cache d'abord
                membersWithRole = role.members.filter(m => !m.user.bot);
                
                // Si le cache est vide ou incomplet, fetch avec timeout
                if (membersWithRole.size === 0) {
                    console.log('📥 Récupération des membres du serveur...');
                    const members = await guild.members.fetch({ 
                        force: false, // Utiliser le cache si disponible
                        time: 15000   // Timeout de 15 secondes
                    }).catch(err => {
                        console.error('⚠️ Impossible de récupérer tous les membres, utilisation du cache:', err.message);
                        return guild.members.cache;
                    });
                    
                    membersWithRole = members.filter(m => m.roles.cache.has(CONFIG.ROLE_OP_ID) && !m.user.bot);
                }
            } catch (error) {
                console.error('❌ Erreur lors de la récupération des membres:', error.message);
                // En cas d'erreur, utiliser le cache disponible
                membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(CONFIG.ROLE_OP_ID) && !m.user.bot);
            }

            if (membersWithRole.size === 0) {
                console.log('⚠️ Aucun membre trouvé avec le rôle');
                return;
            }

            console.log(`👥 ${membersWithRole.size} membre(s) avec le rôle trouvé(s)`);

            // Récupérer toutes les réactions
            await Promise.all(presenceMsg.reactions.cache.map(r => r.users.fetch().catch(() => new Map())));

            // Trouver qui a réagi
            const reactedUsers = new Set();
            for (const reaction of presenceMsg.reactions.cache.values()) {
                reaction.users.cache.forEach(u => {
                    if (!u.bot) reactedUsers.add(u.id);
                });
            }

            // Trouver qui n'a PAS réagi
            const notReacted = membersWithRole.filter(m => !reactedUsers.has(m.id));
            
            console.log(`📊 ${reactedUsers.size} membre(s) ont réagi, ${notReacted.size} n'ont pas réagi`);

            // Si tout le monde a réagi, arrêter les rappels
            if (notReacted.size === 0) {
                console.log(`✅ Tous les membres ont réagi pour l'opération ${opData.heure}. Arrêt des rappels.`);
                stopAutoReminder(messageId);
                return;
            }

            // Créer la liste de mentions
            const pingList = notReacted.map(m => `<@${m.id}>`).join(' | ');

            // Déterminer le message de rappel selon l'heure
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

            // Envoyer le rappel
            const reminderMsg = await presenceMsg.reply({
                content: reminderText,
                allowedMentions: { users: notReacted.map(m => m.id) }
            });

            // Supprimer l'ancien message de rappel s'il existe
            if (opData.lastReminderMsg) {
                await opData.lastReminderMsg.delete().catch(() => {});
            }

            // Mettre à jour le dernier message de rappel
            opData.lastReminderMsg = reminderMsg;
            activeOperations.set(messageId, opData);

            console.log(`⏰ Rappel automatique envoyé pour l'opération ${opData.heure} (${notReacted.size} membre(s))`);

        } catch (error) {
            console.error(`❌ Erreur lors du rappel automatique (${opData.heure}):`, error);
        }
    };

    // Lancer le premier rappel après un délai pour laisser le temps au cache de se remplir
    setTimeout(sendReminder, 5000); // 5 secondes de délai initial

    // Puis répéter à intervalle régulier
    const interval = setInterval(sendReminder, CONFIG.RAPPEL_INTERVALLE);
    
    // Sauvegarder l'intervalle dans les données de l'opération
    opData.reminderInterval = interval;
    activeOperations.set(messageId, opData);

    console.log(`🔄 Système de rappels automatiques démarré pour l'opération ${opData.heure}`);
}

function stopAutoReminder(messageId) {
    const opData = activeOperations.get(messageId);
    if (opData && opData.reminderInterval) {
        clearInterval(opData.reminderInterval);
        opData.reminderInterval = null;
        activeOperations.set(messageId, opData);
        console.log(`⏹️ Système de rappels automatiques arrêté pour l'opération ${opData.heure}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 EVENT: BOT PRÊT
// ═══════════════════════════════════════════════════════════════

client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    console.log(`🛡️ Système de présence opérationnelle activé`);
    client.user.setActivity('les opérations', { type: 'WATCHING' });
});

// ═══════════════════════════════════════════════════════════════
// 💬 EVENT: MESSAGES (COMMANDES)
// ═══════════════════════════════════════════════════════════════

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ──────────────────────────────────────────────────────────
    // 🔵 COMMANDE: CRÉER UNE OPÉRATION
    // ──────────────────────────────────────────────────────────
    if (command === 'presence' || command === 'op') {
        // Vérification du rôle
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0051')
                .setAuthor({ name: 'SYSTÈME DE SÉCURITÉ', iconURL: message.author.displayAvatarURL() })
                .setTitle('🚫 ACCÈS REFUSÉ')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Vous ne disposez pas des permissions nécessaires pour exécuter cette commande.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields({
                    name: '⚠️ ┃ RAISON DU REFUS',
                    value: '```diff\n- Rôle requis manquant\n- Permissions insuffisantes\n```',
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: 'Système de protection des commandes', iconURL: message.guild.iconURL() });
            return message.reply({ embeds: [errorEmbed] });
        }

        // Menu de sélection de date
        const dateMenu = new StringSelectMenuBuilder()
            .setCustomId('select_date')
            .setPlaceholder('📅 Choisir une date')
            .addOptions([
                {
                    label: 'Aujourd\'hui',
                    description: getDateString(0),
                    value: 'today',
                    emoji: '📅'
                },
                {
                    label: 'Demain',
                    description: getDateString(1),
                    value: 'tomorrow',
                    emoji: '📆'
                }
            ]);

        const row1 = new ActionRowBuilder().addComponents(dateMenu);

        const setupEmbed = new EmbedBuilder()
            .setColor('#00D9FF')
            .setAuthor({ name: 'CRÉATION D\'OPÉRATION', iconURL: message.author.displayAvatarURL() })
            .setTitle('🛡️ CONFIGURATION DE L\'OPÉRATION')
            .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Bienvenue dans l\'assistant de création d\'opération.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            .addFields({
                name: '📋 ┃ ÉTAPE 1/2 — SÉLECTION DE LA DATE',
                value: '> Utilisez le menu déroulant ci-dessous pour choisir\n> la date de votre opération.\n\n```yaml\nOptions disponibles:\n  • Aujourd\'hui\n  • Demain\n```',
                inline: false
            })
            .setThumbnail(message.guild.iconURL())
            .setTimestamp()
            .setFooter({ text: 'Assistant de création • Étape 1/2', iconURL: message.author.displayAvatarURL() });

        const setupMessage = await message.reply({ embeds: [setupEmbed], components: [row1] });

        // Collecteur pour la date
        const dateCollector = setupMessage.createMessageComponentCollector({ time: 120000 }); // Augmenté à 2 minutes

        dateCollector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ Seul l\'auteur de la commande peut interagir.', ephemeral: true });
            }

            const selectedDate = i.values[0] === 'today' ? getDateString(0) : getDateString(1);
            
            // Arrêter le collecteur de date
            dateCollector.stop();

            // Menu de sélection d'heure
            const heureMenu = new StringSelectMenuBuilder()
                .setCustomId('select_heure')
                .setPlaceholder('🕐 Choisir une heure')
                .addOptions([
                    {
                        label: '15h00',
                        value: '15:00',
                        emoji: '🕒'
                    },
                    {
                        label: '21h00',
                        value: '21:00',
                        emoji: '🕘'
                    },
                    {
                        label: 'Heure personnalisée',
                        value: 'custom',
                        emoji: '⏰'
                    }
                ]);

            const row2 = new ActionRowBuilder().addComponents(heureMenu);

            const heureEmbed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setAuthor({ name: 'CRÉATION D\'OPÉRATION', iconURL: message.author.displayAvatarURL() })
                .setTitle('🛡️ CONFIGURATION DE L\'OPÉRATION')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Configuration en cours...**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    {
                        name: '✅ ┃ DATE SÉLECTIONNÉE',
                        value: `\`\`\`fix\n${selectedDate}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '📋 ┃ ÉTAPE 2/2 — SÉLECTION DE L\'HEURE',
                        value: '> Utilisez le menu déroulant ci-dessous pour choisir\n> l\'heure de rassemblement.\n\n```yaml\nOptions disponibles:\n  • 15h00 (Après-midi)\n  • 21h00 (Soirée)\n  • Heure personnalisée\n```',
                        inline: false
                    }
                )
                .setThumbnail(message.guild.iconURL())
                .setTimestamp()
                .setFooter({ text: 'Assistant de création • Étape 2/2', iconURL: message.author.displayAvatarURL() });

            try {
                await i.update({ embeds: [heureEmbed], components: [row2] });
            } catch (error) {
                console.error('Erreur lors de la mise à jour de l\'interaction:', error);
                await setupMessage.edit({ embeds: [heureEmbed], components: [row2] });
            }

            // Collecteur pour l'heure
            const heureCollector = setupMessage.createMessageComponentCollector({ time: 120000 }); // 2 minutes

            heureCollector.on('collect', async (i2) => {
                if (i2.user.id !== message.author.id) {
                    return i2.reply({ content: '❌ Seul l\'auteur de la commande peut interagir.', ephemeral: true });
                }

                // Arrêter le collecteur d'heure
                heureCollector.stop();

                let selectedHeure = i2.values[0];

                if (selectedHeure === 'custom') {
                    try {
                        await i2.reply({ content: '⏰ Veuillez entrer une heure personnalisée (format HH:MM, ex: 18:30):', ephemeral: true });
                    } catch (error) {
                        console.error('Erreur lors de la réponse:', error);
                    }
                    
                    const filter = m => m.author.id === message.author.id && /^\d{1,2}:\d{2}$/.test(m.content);
                    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
                        .catch(() => null);

                    if (!collected) {
                        await setupMessage.edit({ 
                            content: '❌ Temps écoulé. Veuillez recommencer la commande.', 
                            embeds: [], 
                            components: [] 
                        });
                        return;
                    }

                    selectedHeure = collected.first().content;
                    await collected.first().delete().catch(() => {});
                } else {
                    try {
                        await i2.deferUpdate();
                    } catch (error) {
                        console.error('Erreur defer:', error);
                    }
                }

                // Créer l'embed d'opération
                const opEmbed = createOperationEmbed(selectedDate, selectedHeure);
                
                try {
                    await setupMessage.delete().catch(() => {});
                } catch (error) {
                    console.error('Erreur suppression message setup:', error);
                }
                
                const opMessage = await message.channel.send({
                    content: `<@&${CONFIG.ROLE_OP_ID}>`,
                    embeds: [opEmbed]
                });

                // Ajouter les réactions
                await opMessage.react(REACTIONS.PRESENT);
                await opMessage.react(REACTIONS.ABSENT);
                await opMessage.react(REACTIONS.RETARD);

                // Enregistrer l'opération
                activeOperations.set(opMessage.id, {
                    date: selectedDate,
                    heure: selectedHeure,
                    channelId: message.channel.id,
                    guildId: message.guild.id,
                    reminderInterval: null,
                    lastReminderMsg: null
                });

                // Démarrer le système de rappels automatiques
                if (CONFIG.RAPPEL_AUTO_ACTIVE) {
                    await startAutoReminder(opMessage.id);
                }
            });

            heureCollector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    setupMessage.edit({ 
                        content: '⏱️ Temps écoulé. Veuillez recommencer la commande.', 
                        embeds: [], 
                        components: [] 
                    }).catch(() => {});
                }
            });
        });

        dateCollector.on('end', (collected, reason) => {
            if (reason === 'time') {
                setupMessage.edit({ 
                    content: '⏱️ Temps écoulé. Veuillez recommencer la commande.', 
                    embeds: [], 
                    components: [] 
                }).catch(() => {});
            }
        });
    }

    // ──────────────────────────────────────────────────────────
    // 🗑️ COMMANDE: CLEAR (SUPPRESSION TOTALE DU SALON)
    // ──────────────────────────────────────────────────────────
    if (command === 'clear' || command === 'purge') {
        // Vérification du rôle
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0051')
                .setAuthor({ name: 'SYSTÈME DE SÉCURITÉ', iconURL: message.author.displayAvatarURL() })
                .setTitle('🚫 ACCÈS REFUSÉ')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Vous ne disposez pas des permissions nécessaires pour exécuter cette commande.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields({
                    name: '⚠️ ┃ RAISON DU REFUS',
                    value: '```diff\n- Rôle requis manquant\n- Permissions insuffisantes\n```',
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: 'Système de protection des commandes', iconURL: message.guild.iconURL() });
            return message.reply({ embeds: [errorEmbed] });
        }

        // Vérification des permissions du bot
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0051')
                .setTitle('❌ PERMISSIONS INSUFFISANTES')
                .setDescription('Le bot n\'a pas la permission de gérer les messages dans ce salon.')
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        // Confirmation avant suppression
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFB800')
            .setAuthor({ name: 'SYSTÈME DE NETTOYAGE', iconURL: message.author.displayAvatarURL() })
            .setTitle('⚠️ CONFIRMATION REQUISE')
            .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Vous êtes sur le point de supprimer TOUS les messages de ce salon.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            .addFields({
                name: '🗑️ ┃ ACTION',
                value: '```diff\n- Suppression totale du salon\n- Tous les messages seront effacés\n- Cette action est IRRÉVERSIBLE\n```',
                inline: false
            })
            .setTimestamp()
            .setFooter({ text: 'Cliquez sur ✅ pour confirmer ou ❌ pour annuler', iconURL: message.guild.iconURL() });

        const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
        await confirmMsg.react('✅');
        await confirmMsg.react('❌');

        const filter = (reaction, user) => {
            return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };

        const collector = confirmMsg.createReactionCollector({ filter, max: 1, time: 30000 });

        collector.on('collect', async (reaction) => {
            if (reaction.emoji.name === '❌') {
                const cancelEmbed = new EmbedBuilder()
                    .setColor('#00FF94')
                    .setTitle('✅ OPÉRATION ANNULÉE')
                    .setDescription('La suppression des messages a été annulée.')
                    .setTimestamp();
                await confirmMsg.edit({ embeds: [cancelEmbed] });
                await confirmMsg.reactions.removeAll().catch(() => {});
                return;
            }

            // Démarrer la suppression
            const progressEmbed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setAuthor({ name: 'NETTOYAGE EN COURS', iconURL: message.author.displayAvatarURL() })
                .setTitle('🔄 SUPPRESSION DES MESSAGES...')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Veuillez patienter, cette opération peut prendre du temps.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields({
                    name: '📊 ┃ PROGRESSION',
                    value: '```yaml\nStatut: En cours...\nMessages supprimés: Calcul en cours\n```',
                    inline: false
                })
                .setTimestamp();
            
            await confirmMsg.edit({ embeds: [progressEmbed] });
            await confirmMsg.reactions.removeAll().catch(() => {});

            let totalDeleted = 0;
            let hasMoreMessages = true;

            try {
                while (hasMoreMessages) {
                    // Récupérer les messages par lots de 100
                    const fetchedMessages = await message.channel.messages.fetch({ limit: 100 });
                    
                    if (fetchedMessages.size === 0) {
                        hasMoreMessages = false;
                        break;
                    }

                    // Séparer les messages récents (< 14 jours) et anciens (> 14 jours)
                    const now = Date.now();
                    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
                    
                    const recentMessages = fetchedMessages.filter(msg => now - msg.createdTimestamp < twoWeeks);
                    const oldMessages = fetchedMessages.filter(msg => now - msg.createdTimestamp >= twoWeeks);

                    // Supprimer les messages récents en masse
                    if (recentMessages.size > 0) {
                        await message.channel.bulkDelete(recentMessages, true);
                        totalDeleted += recentMessages.size;
                    }

                    // Supprimer les messages anciens un par un
                    for (const [, oldMsg] of oldMessages) {
                        try {
                            await oldMsg.delete();
                            totalDeleted++;
                            // Petit délai pour éviter le rate limit
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            console.error('Erreur lors de la suppression d\'un message ancien:', error);
                        }
                    }

                    // Mettre à jour la progression tous les 50 messages
                    if (totalDeleted % 50 === 0) {
                        const updateEmbed = new EmbedBuilder()
                            .setColor('#00D9FF')
                            .setAuthor({ name: 'NETTOYAGE EN COURS', iconURL: message.author.displayAvatarURL() })
                            .setTitle('🔄 SUPPRESSION DES MESSAGES...')
                            .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Opération en cours, veuillez patienter.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                            .addFields({
                                name: '📊 ┃ PROGRESSION',
                                value: `\`\`\`yaml\nStatut: En cours...\nMessages supprimés: ${totalDeleted}\n\`\`\``,
                                inline: false
                            })
                            .setTimestamp();
                        await confirmMsg.edit({ embeds: [updateEmbed] }).catch(() => {});
                    }

                    // Si on a supprimé moins de 100 messages, il n'y en a plus
                    if (fetchedMessages.size < 100) {
                        hasMoreMessages = false;
                    }
                }

                // Message de succès
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF94')
                    .setAuthor({ name: 'NETTOYAGE TERMINÉ', iconURL: message.author.displayAvatarURL() })
                    .setTitle('✅ SUPPRESSION RÉUSSIE')
                    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Tous les messages du salon ont été supprimés avec succès.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                    .addFields({
                        name: '📊 ┃ STATISTIQUES',
                        value: `\`\`\`yaml\nMessages supprimés: ${totalDeleted}\nSalon: ${message.channel.name}\nExécuté par: ${message.author.tag}\n\`\`\``,
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'Opération terminée avec succès', iconURL: message.guild.iconURL() });

                await confirmMsg.edit({ embeds: [successEmbed] });

                // Supprimer le message de confirmation après 10 secondes
                setTimeout(() => {
                    confirmMsg.delete().catch(() => {});
                }, 10000);

            } catch (error) {
                console.error('Erreur lors de la suppression des messages:', error);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0051')
                    .setTitle('❌ ERREUR')
                    .setDescription(`Une erreur est survenue lors de la suppression.\n\n**Messages supprimés avant l'erreur :** ${totalDeleted}`)
                    .setTimestamp();
                await confirmMsg.edit({ embeds: [errorEmbed] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#FFB800')
                    .setTitle('⏱️ TEMPS ÉCOULÉ')
                    .setDescription('La confirmation a expiré. Opération annulée.')
                    .setTimestamp();
                confirmMsg.edit({ embeds: [timeoutEmbed] });
                confirmMsg.reactions.removeAll().catch(() => {});
            }
        });
    }

    // ──────────────────────────────────────────────────────────
    // 🔔 COMMANDE: RAPPEL MANUEL
    // ──────────────────────────────────────────────────────────
    if (command === 'rappel' || command === 'reminder') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0051')
                .setAuthor({ name: 'SYSTÈME DE SÉCURITÉ', iconURL: message.author.displayAvatarURL() })
                .setTitle('🚫 ACCÈS REFUSÉ')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Vous ne disposez pas des permissions nécessaires pour exécuter cette commande.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields({
                    name: '⚠️ ┃ RAISON DU REFUS',
                    value: '```diff\n- Rôle requis manquant\n- Permissions insuffisantes\n```',
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: 'Système de protection des commandes', iconURL: message.guild.iconURL() });
            return message.reply({ embeds: [errorEmbed] });
        }

        const messageId = args[0];
        if (!messageId) {
            return message.reply('❌ Veuillez fournir l\'ID du message d\'opération. Exemple: `!rappel 123456789`');
        }

        const opData = activeOperations.get(messageId);
        if (!opData) {
            return message.reply('❌ Opération non trouvée. Assurez-vous que l\'ID est correct.');
        }

        try {
            const channel = await client.channels.fetch(opData.channelId);
            const opMessage = await channel.messages.fetch(messageId);

            // Récupérer tous les membres avec le rôle
            const role = await message.guild.roles.fetch(CONFIG.ROLE_OP_ID);
            const membersWithRole = role.members;

            // Récupérer les utilisateurs qui ont réagi
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

            // Trouver les membres qui n'ont pas réagi
            const noReaction = membersWithRole.filter(member => !reactedUsers.has(member.id));

            if (noReaction.size === 0) {
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF94')
                    .setAuthor({ name: 'SYSTÈME DE RAPPELS', iconURL: message.author.displayAvatarURL() })
                    .setTitle('✅ TOUS LES MEMBRES ONT RÉAGI')
                    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Aucun rappel nécessaire pour cette opération.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                    .addFields({
                        name: '📊 ┃ STATISTIQUES',
                        value: '```yaml\nTaux de participation: 100%\nMembres ayant réagi: Tous\nRappels nécessaires: Aucun\n```',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'Système de gestion des rappels', iconURL: message.guild.iconURL() });
                return message.reply({ embeds: [successEmbed] });
            }

            const reminderEmbed = new EmbedBuilder()
                .setColor('#9D4EDD')
                .setAuthor({ name: '⚠️ RAPPEL IMPORTANT', iconURL: message.guild.iconURL() })
                .setTitle('🔔 CONFIRMATION DE PRÉSENCE REQUISE')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Une opération a été planifiée et nécessite votre confirmation.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '📅 ┃ DATE DE L\'OPÉRATION', 
                        value: `\`\`\`fix\n${opData.date}\n\`\`\``, 
                        inline: true 
                    },
                    { 
                        name: '🕐 ┃ HEURE DE RASSEMBLEMENT', 
                        value: `\`\`\`fix\n${opData.heure}\n\`\`\``, 
                        inline: true 
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    },
                    {
                        name: '⚡ ┃ ACTION REQUISE',
                        value: `**Vous n'avez pas encore confirmé votre présence !**\n\n> Cliquez sur le lien ci-dessous pour accéder au message\n> d'opération et réagir avec votre statut.\n\n[➜ **CONFIRMER MA PRÉSENCE**](${opMessage.url})`,
                        inline: false
                    },
                    {
                        name: '📋 ┃ RAPPEL DES OPTIONS',
                        value: `${REACTIONS.PRESENT} **Présent** • ${REACTIONS.ABSENT} **Absent** • ${REACTIONS.RETARD} **En retard**`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: '⏰ Merci de réagir dans les plus brefs délais', iconURL: message.guild.iconURL() });

            let successCount = 0;
            let failCount = 0;

            for (const [id, member] of noReaction) {
                try {
                    await member.send({ embeds: [reminderEmbed] });
                    successCount++;
                } catch (error) {
                    failCount++;
                }
            }

            const resultEmbed = new EmbedBuilder()
                .setColor('#9D4EDD')
                .setAuthor({ name: 'SYSTÈME DE RAPPELS', iconURL: message.author.displayAvatarURL() })
                .setTitle('📨 RAPPORT D\'ENVOI DES RAPPELS')
                .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Les rappels ont été envoyés aux membres concernés.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '✅ ┃ RAPPELS ENVOYÉS', 
                        value: `\`\`\`diff\n+ ${successCount} membre(s)\n\`\`\``, 
                        inline: true 
                    },
                    { 
                        name: '❌ ┃ ÉCHECS D\'ENVOI', 
                        value: `\`\`\`diff\n- ${failCount} membre(s)\n\`\`\``, 
                        inline: true 
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    },
                    {
                        name: '📊 ┃ STATISTIQUES',
                        value: `\`\`\`yaml\nTotal ciblé: ${successCount + failCount}\nTaux de succès: ${Math.round((successCount / (successCount + failCount)) * 100)}%\nOpération: ${opData.date} à ${opData.heure}\n\`\`\``,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Envoyé par ${message.author.tag} • Système de rappels`, 
                    iconURL: message.author.displayAvatarURL() 
                });

            if (failCount > 0) {
                resultEmbed.addFields({
                    name: 'ℹ️ ┃ NOTE',
                    value: '> Les échecs sont généralement dus à des messages privés désactivés.',
                    inline: false
                });
            }

            await message.reply({ embeds: [resultEmbed] });

        } catch (error) {
            console.error('Erreur lors de l\'envoi des rappels:', error);
            message.reply('❌ Une erreur est survenue lors de l\'envoi des rappels.');
        }
    }

    // ──────────────────────────────────────────────────────────
    // ⏹️ COMMANDE: ARRÊTER LES RAPPELS AUTOMATIQUES
    // ──────────────────────────────────────────────────────────
    if (command === 'stoprappel' || command === 'stopreminder') {
        if (!message.member.roles.cache.has(CONFIG.ROLE_COMMAND_ID)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0051')
                .setTitle('🚫 ACCÈS REFUSÉ')
                .setDescription('Vous n\'avez pas la permission d\'utiliser cette commande.')
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        const messageId = args[0];
        if (!messageId) {
            return message.reply('❌ Veuillez fournir l\'ID du message d\'opération. Exemple: `!stoprappel 123456789`');
        }

        const opData = activeOperations.get(messageId);
        if (!opData) {
            return message.reply('❌ Opération non trouvée.');
        }

        stopAutoReminder(messageId);

        const stopEmbed = new EmbedBuilder()
            .setColor('#00FF94')
            .setTitle('⏹️ RAPPELS AUTOMATIQUES ARRÊTÉS')
            .setDescription(`Les rappels automatiques ont été arrêtés pour l'opération du **${opData.date}** à **${opData.heure}**.`)
            .setTimestamp();

        await message.reply({ embeds: [stopEmbed] });
    }
});

// ═══════════════════════════════════════════════════════════════
// 👆 EVENT: AJOUT DE RÉACTION
// ═══════════════════════════════════════════════════════════════

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    // Récupérer la réaction complète si partielle
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Erreur lors du fetch de la réaction:', error);
            return;
        }
    }

    const opData = activeOperations.get(reaction.message.id);
    if (!opData) return;

    const validEmojis = Object.values(REACTIONS);
    
    // Supprimer les réactions non autorisées
    if (!validEmojis.includes(reaction.emoji.name)) {
        await reaction.users.remove(user).catch(() => {});
        return;
    }

    // Supprimer la réaction du bot sur cet emoji
    await reaction.users.remove(client.user).catch(() => {});

    // Supprimer les autres réactions de l'utilisateur
    for (const emoji of validEmojis) {
        if (emoji !== reaction.emoji.name) {
            const otherReaction = reaction.message.reactions.cache.get(emoji);
            if (otherReaction) {
                await otherReaction.users.remove(user).catch(() => {});
            }
        }
    }

    // Log de la réaction
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
});

// ═══════════════════════════════════════════════════════════════
// 👇 EVENT: RETRAIT DE RÉACTION
// ═══════════════════════════════════════════════════════════════

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Erreur lors du fetch de la réaction:', error);
            return;
        }
    }

    const opData = activeOperations.get(reaction.message.id);
    if (!opData) return;

    const validEmojis = Object.values(REACTIONS);
    if (!validEmojis.includes(reaction.emoji.name)) return;

    // Remettre la réaction du bot si elle est à 0
    const userReactions = await reaction.users.fetch();
    const hasUserReactions = userReactions.some(u => !u.bot);

    if (!hasUserReactions) {
        await reaction.message.react(reaction.emoji.name).catch(() => {});
    }

    // Log du retrait
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
});

// ═══════════════════════════════════════════════════════════════
// 🚀 DÉMARRAGE DU BOT
// ═══════════════════════════════════════════════════════════════

client.login(CONFIG.TOKEN);