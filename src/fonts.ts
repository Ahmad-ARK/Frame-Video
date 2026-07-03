// Central font loading. Without this, headless Chrome renders system
// fallbacks and none of the typography survives into the final video.
// Weights are trimmed to what the scenes actually use — loading everything
// costs 100+ network requests per font per render tab.
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

export const playfair = loadPlayfair('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily;
loadPlayfair('italic', { weights: ['400'], subsets: ['latin'] }); // QuoteOverlay
export const oswald = loadOswald('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
export const montserrat = loadMontserrat('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
export const inter = loadInter('normal', { weights: ['500', '600', '700', '800'], subsets: ['latin'] }).fontFamily;
