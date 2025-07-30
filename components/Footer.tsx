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
        <footer className="w-full bg-gray-800/50 backdrop-blur-sm text-center py-3 px-4 text-xs text-gray-500 border-t border-cyan-400/20 flex-shrink-0">
            {isDevBuild ? (
                <span>Development Build</span>
            ) : (
                <span title={`Commit SHA: ${commitSha}`}>
                    Build #{buildNumber} &middot; {shortSha}
                </span>
            )}
        </footer>
    );
};

export default Footer;
