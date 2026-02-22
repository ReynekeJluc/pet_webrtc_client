import './globals.css';

import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
	title: 'Client WebRTC',
	description: 'test WebRTC technology',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='en'>
			<Providers>
				<body className={'antialiased'}>{children}</body>
			</Providers>
		</html>
	);
}
