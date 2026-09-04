import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { AppBar, Box, CssBaseline, Grid, Paper, Toolbar, Typography } from '@mui/material';
import { GenericApp, I18n, Loader, type GenericAppProps, type GenericAppState } from '@iobroker/gui-components';

import MediaCard from './MediaCard';
import { loadCameras, type Camera } from './cameras';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhCnLang from './i18n/zh-cn.json';

interface AppState extends GenericAppState {
    cameras: Camera[];
    loadingCameras: boolean;
    error: string;
}

export default class App extends GenericApp<GenericAppProps, AppState> {
    public constructor(props: GenericAppProps) {
        super(props, {
            translations: {
                en: enLang,
                de: deLang,
                ru: ruLang,
                pt: ptLang,
                nl: nlLang,
                fr: frLang,
                it: itLang,
                es: esLang,
                pl: plLang,
                uk: ukLang,
                'zh-cn': zhCnLang,
            },
        });

        Object.assign(this.state, { cameras: [], loadingCameras: true, error: '' });
    }

    public async onConnectionReady(): Promise<void> {
        await this.reload();
    }

    private async reload(): Promise<void> {
        this.setState({ loadingCameras: true, error: '' });
        try {
            const cameras = await loadCameras(this.socket, `${this.adapterName}.${this.instance}`);
            this.setState({ cameras, loadingCameras: false });
        } catch (e: unknown) {
            this.setState({
                loadingCameras: false,
                error: `${I18n.t('Could not read the media files')}: ${(e as Error).message ?? e}`,
            });
        }
    }

    private formatDate = (timestamp: number): string => new Date(timestamp).toLocaleString(I18n.getLanguage());

    public render(): React.JSX.Element {
        if (!this.state.loaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        const namespace = `${this.adapterName}.${this.instance}`;

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <CssBaseline />
                    <Box sx={{ height: '100%', overflow: 'auto', pb: 2 }}>
                        <AppBar
                            position="static"
                            sx={{ borderRadius: 1, mb: 2 }}
                        >
                            <Toolbar sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
                                <Typography variant="h6">{I18n.t('ring-adapter')}</Typography>
                                <Typography variant="body2">{I18n.t('ring-access')}</Typography>
                            </Toolbar>
                        </AppBar>

                        {this.state.error ? (
                            <Paper sx={{ p: 2, mx: 1 }}>
                                <Typography color="error">{this.state.error}</Typography>
                            </Paper>
                        ) : null}

                        {this.state.loadingCameras ? (
                            <Loader themeType={this.state.themeType} />
                        ) : this.state.cameras.length === 0 ? (
                            <Paper sx={{ p: 2, mx: 1 }}>
                                <Typography variant="h6">{I18n.t('No cameras found')}</Typography>
                                <Typography variant="body2">
                                    {I18n.t('The adapter has not created any camera objects yet')}
                                </Typography>
                            </Paper>
                        ) : (
                            this.state.cameras.map(camera => (
                                <Box
                                    key={camera.fullId}
                                    sx={{ mb: 3, mx: 1 }}
                                >
                                    <Typography
                                        variant="h5"
                                        sx={{
                                            textAlign: 'center',
                                            p: 1,
                                            mb: 1,
                                            borderRadius: 1,
                                            backgroundColor: '#174475',
                                            color: '#eceef0',
                                        }}
                                    >
                                        {camera.name}
                                    </Typography>
                                    <Grid
                                        container
                                        spacing={2}
                                    >
                                        {camera.media.map(media => (
                                            <Grid
                                                key={media.kind}
                                                size={{ xs: 12, md: 6, lg: 4 }}
                                            >
                                                <MediaCard
                                                    media={media}
                                                    namespace={namespace}
                                                    deviceId={camera.deviceId}
                                                    dateFormat={this.formatDate}
                                                />
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            ))
                        )}
                    </Box>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
