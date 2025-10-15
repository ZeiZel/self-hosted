import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type { Options, ThemeConfig } from '@docusaurus/preset-classic';

const classicPreset: Options = {
	docs: {
		sidebarPath: './sidebars.ts',
		editUrl:
			'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
	},
	blog: {
		showReadingTime: true,
		feedOptions: {
			type: ['rss', 'atom'],
			xslt: true,
		},
		editUrl:
			'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
		onInlineTags: 'warn',
		onInlineAuthors: 'warn',
		onUntruncatedBlogPosts: 'warn',
	},
	theme: {
		customCss: './src/css/custom.css',
	},
};

const themeConfig: ThemeConfig = {
	image: 'img/docusaurus-social-card.jpg',
	colorMode: {
		respectPrefersColorScheme: true,
	},
	navbar: {
		title: 'My Site',
		logo: {
			alt: 'My Site Logo',
			src: 'img/logo.svg',
		},
		items: [
			{
				type: 'localeDropdown',
			},
			{
				type: 'docsVersionDropdown',
			},
			{
				type: 'docSidebar',
				sidebarId: 'tutorialSidebar',
				position: 'left',
				label: 'Tutorial',
			},
			{ to: '/blog', label: 'Blog', position: 'left' },
			{
				href: 'https://github.com/ZeiZel/self-hosted',
				label: 'GitHub',
				position: 'right',
			},
		],
	},
	footer: {
		style: 'dark',
		links: [
			{
				title: 'Docs',
				items: [
					{
						label: 'Tutorial',
						to: '/docs/intro',
					},
				],
			},
			{
				title: 'Community',
				items: [
					{
						label: 'Stack Overflow',
						href: 'https://stackoverflow.com/questions/tagged/docusaurus',
					},
					{
						label: 'Discord',
						href: 'https://discordapp.com/invite/docusaurus',
					},
					{
						label: 'X',
						href: 'https://x.com/docusaurus',
					},
				],
			},
			{
				title: 'More',
				items: [
					{
						label: 'Blog',
						to: '/blog',
					},
					{
						label: 'GitHub',
						href: 'https://github.com/facebook/docusaurus',
					},
				],
			},
		],
		copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
	},
	prism: {
		theme: prismThemes.github,
		darkTheme: prismThemes.dracula,
	},
};

export default async (): Promise<Config> => {
	return {
		title: 'Self-hosted system',
		tagline: 'Kubernetes are cool',
		favicon: 'img/favicon.ico',
		future: {
			v4: true,
		},
		url: 'https://your-docusaurus-site.example.com',
		baseUrl: '/',
		organizationName: 'ZeiZel',
		projectName: 'self-hosted',
		onBrokenLinks: 'throw',
		i18n: {
			defaultLocale: 'ru',
			locales: ['en', 'ru'],
		},
		presets: [['classic', classicPreset]],
		themeConfig,
	};
};
