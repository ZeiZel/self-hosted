import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import { aboutTranslations } from './about-i18n';

export default function AboutPage(): ReactNode {
	const { i18n } = useDocusaurusContext();
	const locale = i18n.currentLocale;
	const t =
		aboutTranslations[locale as keyof typeof aboutTranslations] ||
		aboutTranslations.en;

	return (
		<Layout title={t.title} description={t.author.description}>
			<main className="container margin-vert--lg">
				<div className="row">
					<div className="col col--8 col--offset-2">
						<Heading as="h1">{t.title}</Heading>
						<div className="margin-top--lg">
							<Heading as="h2">{t.author.name}</Heading>
							<p className="margin-bottom--lg">{t.author.description}</p>
							<Link
								className="button button--primary button--lg"
								href="https://github.com/ZeiZel/self-hosted"
							>
								{t.author.repositoryLink}
							</Link>
						</div>
					</div>
				</div>
			</main>
		</Layout>
	);
}
