# Watchlist — MVP

Формат: символ TradingView | название | рабочие таймфреймы | комментарий

| Символ | Название | ТФ | Комментарий |
|--------|----------|----|-------------|
| OANDA:XAUUSD | Золото, спот XAU/USD | 1h, 4h, 1d | основной металл |
| OANDA:XAGUSD | Серебро, спот XAG/USD | 1h, 4h, 1d | technicals-rating недоступен — локальный расчёт |
| FX:NGAS | Природный газ (FXCM) | 1h, 4h, 1d | высокая волатильность; technicals-rating недоступен — локальный расчёт |
| FX:UKOIL | Brent нефть (FXCM) | 1h, 4h, 1d | объём и technicals доступны |
| ICEUS:CC1! | Какао, фьючерс непрерывный (ICE US) | 1h, 4h, 1d | technicals-rating на intraday — null, на 1D доступен |

Рабочие ТФ: 1h, 4h, 1d. Всего 15 комбинаций «символ × ТФ».

Проверено через MCP (2026-11-01): все 5 символов отдают OHLCV на 1D;
technicals-rating полный у OANDA:XAUUSD и FX:UKOIL/FX-символов, частичный/нулевой
у OANDA:XAGUSD, FX:NGAS (нет) и ICEUS:CC1! (null на intraday) — для этих
случаев правила используют локальный расчёт tv-indicators.js.