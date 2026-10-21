# EgoHumanoid-V2 CDN assets

The site keeps HTML/CSS/JS/JSON here; media is served from:

`https://assets.archonrobotics.tech/odl/project/EgoHumanoid-V2/`

Filenames replace the old relative path separators with `__`.
For example `assets/videos/human-laptop.mp4` is now
`assets__videos__human-laptop.mp4` under that CDN base.

Upload and verify new media on the CDN before editing page references. Keep
large media out of this repository; the original migration archive is kept
outside Git. Keep WeChat, posters, fonts, logos and video URLs in sync with the
main project site. Font licenses are stored beside the CDN fonts.
