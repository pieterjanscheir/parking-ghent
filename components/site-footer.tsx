export function SiteFooter() {
	return (
		<footer className='border-t border-border/40 mt-12'>
			<div className='mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-6 py-6 sm:flex-row'>
				<p className='text-sm text-foreground'>
					Built by{' '}
					<a
						href='https://www.scheir.eu'
						target='_blank'
						rel='noopener noreferrer'
						className='text-primary underline-offset-4 hover:underline'
					>
						Pieter-Jan Scheir — scheir.eu
					</a>
				</p>
				<p className='text-xs text-muted-foreground'>Data: stad.gent open data portal</p>
			</div>
		</footer>
	)
}
