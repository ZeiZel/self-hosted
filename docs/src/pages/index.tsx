import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import ServiceCard from '@site/src/components/ServiceCard';
import TechStack from '@site/src/components/TechStack';
import QuickStartLinks from '@site/src/components/QuickStartLinks';
import { translations } from '@site/src/i18n';

import styles from './index.module.css';

function HomepageHeader(): ReactNode {
	const { siteConfig, i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<header className={clsx('hero', styles.heroBanner)}>
			<div className='container'>
				<Heading as='h1' className='hero__title'>
					{t.hero.title}
				</Heading>
				<p className='hero__subtitle'>{t.hero.subtitle}</p>
				<div className={styles.buttons}>
					<Link
						className='button button--primary button--lg'
						to='/docs/getting-started/overview'
					>
						{t.hero.getStarted}
					</Link>
					<Link
						className='button button--secondary button--lg'
						to='/docs/services/overview'
					>
						{t.hero.viewServices}
					</Link>
				</div>
			</div>
		</header>
	);
}

function AboutSection(): ReactNode {
	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<section className={styles.section}>
			<div className='container'>
				<div className='row'>
					<div className='col col--8 col--offset-2'>
						<Heading as='h2' className={styles.sectionTitle}>
							{t.about.title}
						</Heading>
						<p className={styles.sectionDescription}>
							{t.about.description1}
						</p>
						<p className={styles.sectionDescription}>
							{t.about.description2}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function FeaturesSection(): ReactNode {
	const features = [
		{
			title: 'Complete Infrastructure',
			description: (
				<>
					Full-stack infrastructure solution with all necessary services
					for development, deployment, and monitoring.
				</>
			),
			icon: '🏗️',
		},
		{
			title: 'Multiple Deployment Options',
			description: (
				<>
					Support for both Docker Compose and Kubernetes deployments,
					allowing flexibility in infrastructure choices.
				</>
			),
			icon: '🚀',
		},
		{
			title: 'Automated Provisioning',
			description: (
				<>
					Infrastructure as Code with Ansible and Terraform for automated
					setup and configuration management.
				</>
			),
			icon: '⚙️',
		},
		{
			title: 'Production Ready',
			description: (
				<>
					All services are configured with best practices for security,
					monitoring, and high availability.
				</>
			),
			icon: '✅',
		},
		{
			title: 'Comprehensive Monitoring',
			description: (
				<>
					Built-in monitoring and logging solutions including Grafana,
					Prometheus, and ELK stack.
				</>
			),
			icon: '📊',
		},
		{
			title: 'Developer Friendly',
			description: (
				<>
					Complete CI/CD pipeline with GitLab, TeamCity, and integrated
					development tools.
				</>
			),
			icon: '👨‍💻',
		},
	];

	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<section className={clsx(styles.section, styles.featuresSection)}>
			<div className='container'>
				<Heading as='h2' className={styles.sectionTitle}>
					{t.features.title}
				</Heading>
				<div className='row'>
					{features.map((feature, idx) => (
						<div key={idx} className='col col--4 margin-bottom--lg'>
							<div className={clsx('card', styles.featureCard)}>
								<div className={styles.featureIcon}>{feature.icon}</div>
								<Heading as='h3' className={styles.featureTitle}>
									{feature.title}
								</Heading>
								<p className={styles.featureDescription}>
									{feature.description}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function ServicesSection(): ReactNode {
	const services = [
		{
			title: 'Productivity',
			category: 'Productivity',
			description: 'Notesnook, Excalidraw, YouTrack for team collaboration',
			icon: '📝',
			link: '/docs/services/productivity',
		},
		{
			title: 'Communication',
			category: 'Communication',
			description: 'Stoat (Revolt) - open-source Discord alternative',
			icon: '💬',
			link: '/docs/services/communication',
		},
		{
			title: 'Storage',
			category: 'Storage',
			description: 'Syncthing, ownCloud, MinIO for data synchronization',
			icon: '☁️',
			link: '/docs/services/storage',
		},
		{
			title: 'Development',
			category: 'Development',
			description: 'GitLab, TeamCity, Hub for CI/CD and code management',
			icon: '🛠️',
			link: '/docs/services/development',
		},
		{
			title: 'Infrastructure',
			category: 'Infrastructure',
			description: 'Traefik, Consul, Vault for service discovery and secrets',
			icon: '🔧',
			link: '/docs/services/infrastructure',
		},
		{
			title: 'Monitoring',
			category: 'Monitoring',
			description: 'Grafana, Prometheus, Loki for observability',
			icon: '📊',
			link: '/docs/services/monitoring',
		},
	];

	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<section className={styles.section}>
			<div className='container'>
				<Heading as='h2' className={styles.sectionTitle}>
					{t.services.title}
				</Heading>
				<p className={styles.sectionDescription}>
					{t.services.description}
				</p>
				<div className='row'>
					{services.map((service, idx) => (
						<div key={idx} className='col col--4 margin-bottom--lg'>
							<ServiceCard {...service} />
						</div>
					))}
				</div>
				<div className={styles.centered}>
					<Link
						className='button button--outline button--primary'
						to='/docs/services/overview'
					>
						{t.services.viewAll}
					</Link>
				</div>
			</div>
		</section>
	);
}

function QuickStartSection(): ReactNode {
	const quickStartLinks = [
		{
			title: 'Docker Compose Deployment',
			description: 'Quick start with Docker Compose for local development',
			to: '/docs/deployment/docker',
			icon: '🐳',
		},
		{
			title: 'Kubernetes Deployment',
			description: 'Production-ready Kubernetes deployment with Helm',
			to: '/docs/deployment/kubernetes',
			icon: '☸️',
		},
		{
			title: 'Ansible Setup',
			description: 'Automated provisioning with Ansible playbooks',
			to: '/docs/deployment/ansible',
			icon: '🔧',
		},
		{
			title: 'Terraform Infrastructure',
			description: 'Infrastructure as Code with Terraform',
			to: '/docs/deployment/terraform',
			icon: '🏗️',
		},
	];

	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<section className={clsx(styles.section, styles.quickStartSection)}>
			<div className='container'>
				<Heading as='h2' className={styles.sectionTitle}>
					{t.quickStart.title}
				</Heading>
				<p className={styles.sectionDescription}>
					{t.quickStart.description}
				</p>
				<div className='row'>
					<div className='col col--8 col--offset-2'>
						<QuickStartLinks links={quickStartLinks} />
					</div>
				</div>
			</div>
		</section>
	);
}

function TechStackSection(): ReactNode {
	const technologies = [
		{ name: 'Kubernetes', icon: '☸️' },
		{ name: 'Docker', icon: '🐳' },
		{ name: 'Helm', icon: '⚓' },
		{ name: 'Helmfile', icon: '📋' },
		{ name: 'Ansible', icon: '🔧' },
		{ name: 'Terraform', icon: '🏗️' },
		{ name: 'Traefik', icon: '🌐' },
		{ name: 'Caddy', icon: '🔒' },
	];

	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t = translations[locale as keyof typeof translations] || translations.en;
	return (
		<section className={styles.section}>
			<div className='container'>
				<Heading as='h2' className={styles.sectionTitle}>
					{t.techStack.title}
				</Heading>
				<TechStack title='' items={technologies} />
			</div>
		</section>
	);
}

export default function Home(): ReactNode {
	const { siteConfig } = useDocusaurusContext();
	return (
		<Layout
			title={siteConfig.title}
			description={siteConfig.tagline}
		>
			<HomepageHeader />
			<main>
				<AboutSection />
				<FeaturesSection />
				<ServicesSection />
				<QuickStartSection />
				<TechStackSection />
			</main>
		</Layout>
	);
}
