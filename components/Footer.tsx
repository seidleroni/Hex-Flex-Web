
import React from 'react';

const Footer: React.FC = () => {
    // These values are injected by esbuild's --define option during the build process.
    // The build script in package.json sets these. For local builds, they will
    // default to 'dev' and 'local'.
    const buildNumber = process.env.APP_BUILD_NUMBER;
    const commitSha = process.env.APP_COMMIT_SHA;

    const shortSha = commitSha?.substring(0, 7) ?? 'local';

    // In a real CI/CD environment (like GitHub Actions), these will be populated.
    // The default values 'dev' and 'local' signal a local development build.
    const isDevBuild = buildNumber === 'dev' || commitSha === 'local';

    return (
        <footer className="w-full bg-gray-800/50 backdrop-blur-sm py-3 px-4 md:px-8 text-xs text-gray-500 border-t border-cyan-400/20 flex-shrink-0 
                         flex flex-col md:relative md:flex-row items-center justify-center gap-1 md:gap-4">
            
            {/* Centered content. This is the only in-flow item on desktop, so justify-center on the parent works perfectly. */}
            <div className="text-gray-400 text-center order-2 md:order-1">
                <span>© 2025 Jon Seidmann</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>MIT Licensed</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <a 
                    href="https://github.com/seidleroni/Hex-Flex-Web" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-cyan-400 transition-colors"
                    aria-label="View source code on GitHub"
                >
                    View on Github
                </a>
            </div>

            {/* Build info. Stacks on mobile, becomes absolutely positioned on desktop to not interfere with centering. */}
            <div className="text-gray-400 order-1 md:order-2 
                             md:absolute md:right-8 md:top-0 md:bottom-0 md:flex md:items-center">
                {isDevBuild ? (
                    <span>Development Build</span>
                ) : (
                    <span title={`Commit SHA: ${commitSha}`}>
                        Build #{buildNumber} &middot; {shortSha}
                    </span>
                )}
            </div>
        </footer>
    );
};

export default Footer;
