import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Card,
    CardContent,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
    type SelectChangeEvent,
} from '@mui/material';
import { I18n } from '@iobroker/gui-components';

import { buildRecordingUrl, type Media } from './cameras';

interface MediaCardProps {
    media: Media;
    namespace: string;
    deviceId: string;
    dateFormat: (timestamp: number) => string;
}

const CURRENT = '';

export default function MediaCard({ media, namespace, deviceId, dateFormat }: MediaCardProps): React.JSX.Element {
    const [selected, setSelected] = useState<string>(CURRENT);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const source = useMemo(
        () =>
            selected === CURRENT
                ? media.currentUrl
                : buildRecordingUrl(media.currentUrl, namespace, deviceId, selected),
        [selected, media.currentUrl, namespace, deviceId],
    );

    // a <video> only picks up a changed <source> after an explicit load()
    useEffect(() => {
        videoRef.current?.load();
    }, [source]);

    const title = I18n.t(media.kind);

    return (
        <Card
            variant="outlined"
            sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
                <Typography
                    variant="h6"
                    color="primary"
                    sx={{ textAlign: 'center' }}
                >
                    {title}
                </Typography>

                {media.type === 'image' ? (
                    <img
                        src={source}
                        alt={title}
                        title={I18n.t('Open in full screen')}
                        style={{ maxWidth: '100%', cursor: 'zoom-in', borderRadius: 4 }}
                        onClick={event => void event.currentTarget.requestFullscreen?.()}
                    />
                ) : (
                    <video
                        ref={videoRef}
                        playsInline
                        preload="auto"
                        controls
                        style={{ maxWidth: '100%', borderRadius: 4 }}
                    >
                        <source
                            src={source}
                            type="video/mp4"
                        />
                    </video>
                )}

                {media.recordings.length > 0 && (
                    <FormControl
                        fullWidth
                        size="small"
                        sx={{ mt: 'auto' }}
                    >
                        <InputLabel id={`${deviceId}-${media.kind}-label`}>{I18n.t('ChooseDate')}</InputLabel>
                        <Select
                            labelId={`${deviceId}-${media.kind}-label`}
                            label={I18n.t('ChooseDate')}
                            value={selected}
                            onChange={(event: SelectChangeEvent): void => setSelected(event.target.value)}
                        >
                            <MenuItem value={CURRENT}>
                                <em>{I18n.t('Latest recording')}</em>
                            </MenuItem>
                            {media.recordings.map(recording => (
                                <MenuItem
                                    key={recording.file}
                                    value={recording.file}
                                >
                                    {dateFormat(recording.timestamp as number)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </CardContent>
        </Card>
    );
}
