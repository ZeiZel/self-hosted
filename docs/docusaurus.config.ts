import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type { Options, ThemeConfig } from '@docusaurus/preset-classic';

const selfHostedConfig = {
	author: 'ZeiZel',
	project: {
		name: 'self-hosted',
	},
	urls: {
		docs: 'https://github.com/ZeiZel/self-hosted',
		stoat: 'https://github.com/ZeiZel/self-hosted',
		rss: 'https://github.com/ZeiZel/self-hosted',
		landing: 'https://zeizel.github.io',
		repo: 'https://github.com/ZeiZel/self-hosted',
	},
};

const classicPreset: Options = {
	docs: {
		sidebarPath: './sidebars.ts',
		editUrl: selfHostedConfig.urls.docs,
	},
	blog: {
		showReadingTime: true,
		feedOptions: {
			type: ['rss', 'atom'],
			xslt: true,
		},
		editUrl: selfHostedConfig.urls.rss,
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
		title: 'Self-hosted',
		logo: {
			alt: 'Self-hosted-world',
			src: 'img/logo.svg',
		},
		items: [
			{
				type: 'localeDropdown',
				position: 'right',
			},
			{
				type: 'docsVersionDropdown',
			},
			{
				// Next
				type: 'docSidebar',
				sidebarId: 'tutorialSidebar',
				position: 'left',
				label: 'Tutorial',
			},
			{ to: '/about', label: 'About', position: 'left' },
			{
				href: selfHostedConfig.urls.repo,
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
						label: 'Docs',
						to: '/docs/intro',
					},
				],
			},
			{
				title: 'Community',
				items: [
					{
						label: 'Stoat Server of Self-hosted',
						href: 'https://stoat.zeizel.ru',
					},
				],
			},
			{
				title: 'More',
				items: [
					{
						label: 'About',
						to: '/about',
					},
					{
						label: 'GitHub',
						href: selfHostedConfig.urls.repo,
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
		url: selfHostedConfig.urls.landing,
		baseUrl: '/self-hosted/',
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
