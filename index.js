import React from 'react';
import PropTypes from 'prop-types';
import JsxParser from 'react-jsx-parser';

const {
  valid,
  satisfies,
} = require('semver');

const DynamicJsx = React.createContext(null);

const extrapolate = (components, resolutionErrors, dependency, req = {}, pkg = {}) => {
  return Object.entries(((req.config || {})[dependency]) || {})
    .reduce(
      ({ components, resolutionErrors }, [Component, opts]) => {
        const impl = ((pkg.config || {})[dependency] || {})[Component];
        // TODO: Support refined options/props implementation. (Use an object/array instead of a boolean.)
        if (!!opts && !!impl) {
          return {
            components: {
              ...components,
              [Component]: impl,
            },
            resolutionErrors,
          };
        }
        return {
          components,
          resolutionErrors: [
            ...resolutionErrors,
            new ReferenceError(
              `Failed to resolve a runtime implementation for "<${Component}/>".`,
            ),
          ],
        };
      },
      {
        components,
        resolutionErrors,
      },
    );
};

function synthesize(req = {}, pkg = {}) {
  const {
    dependencies,
    config,
    scripts,
  } = req;
  const { 
    components,
    resolutionErrors,
  } = Object.entries(dependencies || {})
    .reduce(
      ({ components, resolutionErrors }, [dependency, reqVersion]) => {
        if (valid(reqVersion)) {
          const pkgVersion = ((pkg.dependencies) || {})[dependency];
          if (valid(pkgVersion)) {
            if (satisfies(reqVersion, pkgVersion)) {
              const {
                components: extrapolatedComponents,
                resolutionErrors: extrapolatedResolutionErrors,
              } = extrapolate(components, resolutionErrors, dependency, req, pkg);
              return {
                components: {
                  ...components,
                  ...extrapolatedComponents,
                },
                resolutionErrors: [
                  ...resolutionErrors,
                  ...extrapolatedResolutionErrors,
                ],
              };
            }
          }
        }
        return {
          components,
          resolutionErrors: [
            ...resolutionErrors,
            new ReferenceError(
              `Failed to instantiate "${dependency}" at request version "${reqVersion}".`,
            ),
          ],
        };
      },
      {
        resolutionErrors: [],
        components: {},
      },
    );
  return {
    components,
    resolutionErrors,
    scripts,
  };
}

export const withDynamicJsx = Consumer => class ThemeConsumer extends React.Component {
  static contextType = DynamicJsx;
  render() {
    const {
      components,
      scripts,
      renderFailure,
      resolutionErrors,
    } = this.context;
    return (
      <Consumer
        components={components}
        scripts={scripts}
        resolutionErrors={resolutionErrors}
        renderFailure={renderFailure}
        {...this.props}
      />
    );
  }
};

export const ScriptProvider = withDynamicJsx(
  ({ script, components, renderFailure, resolutionErrors, scripts, ...extraProps }) => {
    const jsx = scripts[script];
    const resolvedErrors = [
      ...resolutionErrors,
      (!jsx) && new ReferenceError(
        `Failed to resolve script "${script}".`,
      ),
    ]
      .filter(e => !!e);
    if (resolvedErrors.length === 0) {
      return (
        <JsxParser
          components={components}
          renderInWrapper={false}
          jsx={jsx}
          {...extraProps}
        />
      );
    }
    if (renderFailure) {
      return renderFailure(
        resolvedErrors,
      );
    }
    return null;
  },
);

export default ({ request, runtime, renderFailure, children, ...extraProps }) => (
  <DynamicJsx.Provider
    value={{
      ...synthesize(
        request,
        runtime,
      ),
      renderFailure,
    }}
  >
    {children}
  </DynamicJsx.Provider>
);