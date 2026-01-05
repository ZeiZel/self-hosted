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
  image: "img/docusaurus-social-card.jpg",
  colorMode: {
    respectPrefersColorScheme: true,
    defaultMode: "light",
    disableSwitch: false,
  },
  metadata: [
    {
      name: "keywords",
      content:
        "self-hosted, kubernetes, docker, infrastructure, devops, home-lab, helm, ansible, terraform",
    },
    { name: "author", content: "ZeiZel" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Self-hosted Infrastructure" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
  navbar: {
    title: "Self-hosted Infrastructure",
    logo: {
      alt: "Self-hosted Infrastructure Logo",
      src: "img/logo.svg",
    },
    hideOnScroll: true,
    items: [
      { to: "/about", label: "About", position: "left" },
      { to: "/docs", label: "Docs", position: "left" },
      {
        type: "localeDropdown",
        position: "right",
        dropdownItemsAfter: [
          {
            href: selfHostedConfig.urls.repo,
            label: "Help us translate",
          },
        ],
      },
      {
        href: selfHostedConfig.urls.repo,
        label: "GitHub",
        position: "right",
      },
    ],
  },
  footer: {
    style: "dark",
    links: [
      {
        title: "Documentation",
        items: [
          {
            label: "Getting Started",
            to: "/docs/intro",
          },
          {
            label: "Services",
            to: "/docs/services/overview",
          },
          {
            label: "Deployment",
            to: "/docs/deployment/overview",
          },
        ],
      },
      {
        title: "Community",
        items: [
          {
            label: "Stoat Server",
            href: "https://stoat.zeizel.ru",
          },
          {
            label: "GitHub Discussions",
            href: `${selfHostedConfig.urls.repo}/discussions`,
          },
        ],
      },
      {
        title: "More",
        items: [
          {
            label: "About",
            to: "/about",
          },
          {
            label: "GitHub",
            href: selfHostedConfig.urls.repo,
          },
        ],
      },
    ],
    copyright: `Copyright © 2025-${new Date().getFullYear()} Self-hosted Infrastructure.`,
  },
  prism: {
    theme: prismThemes.github,
    darkTheme: prismThemes.dracula,
    additionalLanguages: ["bash", "yaml", "json", "docker"],
  },
};

export default async (): Promise<Config> => {
	return {
		title: 'Self-hosted Infrastructure',
		tagline: 'Complete self-hosted infrastructure solution for development and production environments',
		favicon: 'img/favicon.ico',
		future: {
			v4: true,
		},
		url: selfHostedConfig.urls.landing,
		baseUrl: '/self-hosted/',
		organizationName: 'ZeiZel',
		projectName: 'self-hosted',
		onBrokenLinks: 'throw',
		markdown: {
			hooks: {
				onBrokenMarkdownLinks: 'warn',
			}
		},
		i18n: {
			defaultLocale: 'en',
			locales: ['en', 'ru'],
			localeConfigs: {
				en: {
					label: 'English',
					htmlLang: 'en-US',
					direction: 'ltr',
					calendar: 'gregory',
				},
				ru: {
					label: 'Русский',
					htmlLang: 'ru-RU',
					direction: 'ltr',
					calendar: 'gregory',
				},
			},
		},
		presets: [['classic', classicPreset]],
		themeConfig,
		plugins: [],
		headTags: [
			{
				tagName: 'meta',
				attributes: {
					name: 'description',
					content:
						'Complete self-hosted infrastructure solution with Kubernetes, Docker, Ansible, and Terraform. Deploy GitLab, Grafana, Prometheus, and more.',
				},
			},
			{
				tagName: 'meta',
				attributes: {
					property: 'og:description',
					content:
						'Complete self-hosted infrastructure solution with Kubernetes, Docker, Ansible, and Terraform. Deploy GitLab, Grafana, Prometheus, and more.',
				},
			},
			{
				tagName: 'meta',
				attributes: {
					name: 'twitter:description',
					content:
						'Complete self-hosted infrastructure solution with Kubernetes, Docker, Ansible, and Terraform.',
				},
			},
		],
	};
};
