import "dotenv/config";
import { prisma } from '../prisma.js';

async function main() {
    console.log('--- Starting ATS Seeder ---');

    // 1. Get the first user and workspace (or use defaults)
    const user = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
    }) || await prisma.user.findFirst();

    if (!user) {
        console.error('No user found in the database. Please create a user first.');
        return;
    }

    const workspaceId = process.env.WORKSPACE_ID || 'cmn3zvsj6000dd8ikegztlu1m';
    const userId = user.id;

    console.log(`Seeding for User: ${user.email} (ID: ${userId})`);
    console.log(`Workspace ID: ${workspaceId}`);

    // 2. Seed Jobs
    const jobsData = [
        {
            title: 'Senior Frontend Developer',
            description: 'We are looking for a React expert with Next.js experience to lead our recruitment portal team.',
            department: 'Engineering',
            location: 'Remote',
            type: 'FULL_TIME',
            salaryRange: '₹18L - ₹25L',
            status: 'OPEN',
            requirements: [
                '5+ years of experience with React/Next.js',
                'Deep understanding of CSS and responsive design',
                'Experience with state management (Redux, Zustand)',
                'Strong communication and leadership skills'
            ],
            benefits: [
                'Flexible working hours',
                'Health & Dental insurance',
                'Learning & Development budget',
                'Equity options'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'UI/UX Designer',
            description: 'Join our creative team to design high-fidelity recruitment experiences using Figma and Framer.',
            department: 'Design',
            location: 'New York, NY',
            type: 'FULL_TIME',
            salaryRange: '₹12L - ₹18L',
            status: 'OPEN',
            requirements: [
                '3+ years of UI/UX design experience',
                'Proficiency in Figma and Adobe Creative Suite',
                'Strong portfolio of work across web and mobile',
                'Ability to conduct user research and testing'
            ],
            benefits: [
                'Modern office in Manhattan',
                'Annual design retreat',
                'Premium Figma account'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'Backend Engineer (Node.js)',
            description: 'Help us scale our AI-driven parsing engine and Prisma-based infrastructure.',
            department: 'Engineering',
            location: 'London, UK',
            type: 'CONTRACT',
            salaryRange: '₹15L - ₹22L',
            status: 'OPEN',
            requirements: [
                'Expertise in Node.js and TypeScript',
                'Deep knowledge of PostgreSQL and Redis',
                'Experience with AWS or GCP',
                'Understanding of microservices architecture'
            ],
            benefits: [
                'Relocation assistance',
                'Free gym membership',
                'Weekly team lunch'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'HR Manager',
            department: 'People',
            description: 'Scale our hiring culture and manage the recruitment lifecycle at scale.',
            location: 'Bangalore, India',
            type: 'FULL_TIME',
            salaryRange: '₹8L - ₹12L',
            status: 'OPEN',
            requirements: [
                'Proven track record in talent acquisition',
                'Strong understanding of labor laws',
                'Excellent interpersonal skills',
                'Experience with HRMS tools'
            ],
            benefits: [
                'Health Insurance',
                'Paid Parental Leave',
                'Performance Bonuses'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'Product Manager',
            description: 'Define product vision and roadmap for our Next-Gen recruitment platform.',
            department: 'Product',
            location: 'Remote',
            type: 'FULL_TIME',
            salaryRange: '₹20L - ₹30L',
            status: 'OPEN',
            requirements: [
                '4+ years of product management experience',
                'Experience in SaaS or B2B products',
                'Strong analytical and project management skills',
                'Knowledge of Agile/Scrum'
            ],
            benefits: [
                'Modern workstation allowance',
                'Annual learning budget',
                'Remote-first culture'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'DevOps Engineer',
            description: 'Automate our CI/CD pipelines and manage our AWS infrastructure.',
            department: 'Infrastructure',
            location: 'Berlin, Germany',
            type: 'FULL_TIME',
            salaryRange: '₹16L - ₹24L',
            status: 'OPEN',
            requirements: [
                '3+ years of DevOps experience',
                'Deep knowledge of Docker and Kubernetes',
                'Experience with Terraform or CloudFormation',
                'Proficiency in Linux administration'
            ],
            benefits: [
                'Public transport stipend',
                'Flexible hours',
                'Professional certification support'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'QA Automation Engineer',
            description: 'Ensure the highest quality of our software through automated testing.',
            department: 'Engineering',
            location: 'Toronto, Canada',
            type: 'FULL_TIME',
            salaryRange: '₹10L - ₹15L',
            status: 'OPEN',
            requirements: [
                'Experience with Cypress or Selenium',
                'Strong knowledge of JavaScript/TypeScript',
                'Familiarity with CI/CD pipelines',
                'Attention to detail'
            ],
            benefits: [
                'Home office stipend',
                'Mental health support',
                'Unlimited PTO'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'Data Scientist',
            description: 'Apply machine learning models to improve our candidate matching algorithms.',
            department: 'Data',
            location: 'Seattle, WA',
            type: 'FULL_TIME',
            salaryRange: '₹18L - ₹28L',
            status: 'OPEN',
            requirements: [
                'Expertise in Python and R',
                'Experience with ML frameworks (TensorFlow, PyTorch)',
                'Strong background in statistics and mathematics',
                'Knowledge of SQL and big data tools'
            ],
            benefits: [
                'Annual data science conference trip',
                'Health & Wellness allowance',
                'Stock options'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'Marketing Specialist',
            description: 'Drive growth and brand awareness through multi-channel marketing campaigns.',
            department: 'Marketing',
            location: 'Remote',
            type: 'FULL_TIME',
            salaryRange: '₹6L - ₹10L',
            status: 'OPEN',
            requirements: [
                'Proven track record in digital marketing',
                'Experience with Google Ads and social media marketing',
                'Strong copywriting and content creation skills',
                'Analytical mindset for campaign optimization'
            ],
            benefits: [
                'Monthly marketing book stipend',
                'Remote work setup allowance',
                'Flexible vacation policy'
            ],
            workspaceId,
            userId,
        },
        {
            title: 'Sales Executive',
            description: 'Expand our customer base and drive revenue growth for our B2B solutions.',
            department: 'Sales',
            location: 'New York, NY',
            type: 'FULL_TIME',
            salaryRange: '₹8L - ₹15L + Commission',
            status: 'OPEN',
            requirements: [
                '2+ years of B2B sales experience',
                'Strong negotiation and presentation skills',
                'Ability to work in a fast-paced environment',
                'Experience with CRM tools (Salesforce, HubSpot)'
            ],
            benefits: [
                'Uncapped commission structure',
                'Monthly sales team events',
                'Corporate travel opportunities'
            ],
            workspaceId,
            userId,
        }
    ];

    const seededJobs = [];
    for (const job of jobsData) {
        const j = await prisma.job.upsert({
            where: { id: `seed-job-${job.title.toLowerCase().replace(/ /g, '-')}` },
            update: job,
            create: { id: `seed-job-${job.title.toLowerCase().replace(/ /g, '-')}`, ...job }
        });
        seededJobs.push(j);
    }
    console.log(`Seeded ${seededJobs.length} Jobs.`);

    // 3. Seed Candidates
    const candidatesData = [
        {
            name: 'Rohit Sharma',
            email: 'rohit.dev@example.com',
            phone: '+91 98765 43210',
            location: 'Mumbai, India',
            skills: ['React', 'Next.js', 'Tailwind', 'TypeScript'],
            aiSummary: 'Highly proficient Frontend Developer with strong focus on performance and accessibility.',
            aiMatchScore: 92,
            workspaceId,
            userId,
        },
        {
            name: 'Sarah Chen',
            email: 'sarah.ux@example.com',
            phone: '+1 415 555 0123',
            location: 'San Francisco, CA',
            skills: ['Figma', 'Prototyping', 'User Research', 'CSS'],
            aiSummary: 'Creative UI/UX Designer with a background in architectural design and interaction systems.',
            aiMatchScore: 88,
            workspaceId,
            userId,
        },
        {
            name: 'Elena Vovk',
            email: 'elena.node@example.com',
            phone: '+44 20 7946 0958',
            location: 'Berlin, Germany',
            skills: ['Node.js', 'PostgreSQL', 'Redis', 'Docker'],
            aiSummary: 'Senior Systems Architect with specialization in real-time communication protocols.',
            aiMatchScore: 95,
            workspaceId,
            userId,
        }
    ];

    const seededCandidates = [];
    for (const candidate of candidatesData) {
        const c = await prisma.candidate.upsert({
            where: { email: candidate.email },
            update: candidate,
            create: candidate
        });
        seededCandidates.push(c);
    }
    console.log(`Seeded ${seededCandidates.length} Candidates.`);

    // 4. Seed Applications
    const stages = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED'];
    for (let i = 0; i < seededCandidates.length; i++) {
        const candidate = seededCandidates[i];
        const job = seededJobs[i % seededJobs.length];
        const stage = stages[i % stages.length];

        const app = await prisma.application.create({
            data: {
                jobId: job.id,
                candidateId: candidate.id,
                stage,
                status: stage === 'REJECTED' ? 'REJECTED' : 'ACTIVE',
                workspaceId,
            }
        });

        if (stage === 'INTERVIEW' || stage === 'OFFER') {
            await prisma.atsNote.create({
                data: {
                    applicationId: app.id,
                    candidateId: candidate.id,
                    userId,
                    text: 'Excellent communication skills and deep technical knowledge.',
                }
            });

            await prisma.scorecard.create({
                data: {
                    applicationId: app.id,
                    candidateId: candidate.id,
                    interviewerId: userId,
                    score: 4.5,
                    feedback: 'Strongly recommended.',
                    attributes: { Technical: 5, Communication: 4 }
                }
            });

            await prisma.interview.create({
                data: {
                    applicationId: app.id,
                    title: 'Technical Round',
                    startTime: new Date(),
                    endTime: new Date(Date.now() + 3600000),
                    status: 'SCHEDULED',
                    interviewers: [user.displayName || 'Manager'],
                }
            });
        }
    }
    console.log('Seeded Applications, Notes, Scorecards, and Interviews.');
    console.log('--- Seeding Complete ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
