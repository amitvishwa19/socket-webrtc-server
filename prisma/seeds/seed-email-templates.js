import "dotenv/config";
import { prisma } from '../prisma.js';

/**
 * Modern, Responsive Premium Master Template
 */
const getTemplate = (title, body, buttonLabel = null, buttonUrl = null) => {
    const appName = process.env.APP_NAME || "Devlomatix";
    const appLogo = process.env.APP_LOGO_URL || "https://devlomatix.online/static/devlomatix_dark.png";
    const appUrl = process.env.APP_URL || "https://devlomatix.online";

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 0; background-color: #0f172a;">
                            <img src="${appLogo}" alt="${appName}" width="180" style="display: block; border: 0;">
                        </td>
                    </tr>
                    
                    <!-- Body -->
                    <tr>
                        <td style="padding: 48px 40px;">
                            <h1 style="margin: 0 0 24px 0; color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; letter-spacing: -0.025em;">
                                ${title}
                            </h1>
                            <div style="color: #475569; font-size: 16px; line-height: 28px; text-align: left;">
                                ${body}
                            </div>
                            
                            ${buttonLabel && buttonUrl ? `
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
                                <tr>
                                    <td align="center">
                                        <a href="${buttonUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);">
                                            ${buttonLabel}
                                        </a>
                                    </td>
                                </tr>
                            </table>` : ''}
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr><td style="padding: 0 40px;"><hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;"></td></tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px; background-color: #fdfdfd;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="color: #94a3b8; font-size: 12px; line-height: 20px;">
                                        <p style="margin: 0 0 16px 0;">© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
                                        <p style="margin: 0;">
                                            <a href="${appUrl}/privacy" style="color: #3b82f6; text-decoration: none;">Privacy Policy</a> • 
                                            <a href="${appUrl}/terms" style="color: #3b82f6; text-decoration: none;">Terms of Service</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
};

async function main() {
    console.log('--- Starting Modular Email Templates Seeder ---');

    const workspaceId = process.env.WORKSPACE_ID || 'cmnbhifag000458ikwhv1zso2';
    console.log(`Target Workspace ID: ${workspaceId}`);

    const defaultAssignments = [
        {
            event: 'USER_WELCOME',
            templateName: 'welcome.jsx',
            subject: 'Welcome Aboard!',
            content: getTemplate(
                'Welcome to {{platformName}}!',
                'We are thrilled to have you here. Your account is now active and ready to use. Explore your workspace to get started with the best productivity tools.',
                'Go to Dashboard',
                '{{platformUrl}}/dashboard'
            )
        },
        {
            event: 'SYSTEM_NOTIFICATION',
            templateName: 'NotificationMail.jsx',
            subject: 'Important System Update',
            content: getTemplate(
                'System Notification',
                'There has been an important update to your workspace settings. Please review the changes to ensure everything is configured to your liking.',
                'Review Settings',
                '{{platformUrl}}/settings'
            )
        },
        {
            event: 'WORKSPACE_INVITE',
            templateName: 'InviteEmailTemplate.jsx',
            subject: 'New Workspace Invitation',
            content: getTemplate(
                'Join the Team!',
                'You have been invited to join a new collaborative workspace. Working together is now easier than ever.',
                'Accept Invitation',
                '{{inviteUrl}}'
            )
        },
        {
            event: 'BOARD_NOTIFICATION',
            templateName: 'BoardNotification.jsx',
            subject: 'Board Activity Update',
            content: getTemplate(
                'Board Activity Alert',
                'There is some new activity on your Kanban board <strong>{{boardName}}</strong>. Stay on top of your projects with real-time updates.',
                'View Board',
                '{{boardUrl}}'
            )
        }
    ];

    let count = 0;
    for (const assignment of defaultAssignments) {
        await prisma.emailAssignment.upsert({
            where: {
                workspaceId_event: {
                    workspaceId,
                    event: assignment.event
                }
            },
            update: {
                templateName: assignment.templateName,
                subject: assignment.subject,
                isActive: true,
                content: assignment.content
            },
            create: {
                workspaceId,
                event: assignment.event,
                templateName: assignment.templateName,
                subject: assignment.subject,
                isActive: true,
                content: assignment.content
            }
        });
        count++;
    }

    console.log(`🚀 Seeded ${count} Modular Email Templates successfully!`);
    console.log('--- Seeding Complete ---');
}

main()
    .catch((e) => {
        console.error('❌ Seeder Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
