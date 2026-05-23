import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

type ExternalHref = string;

export function ExternalLink(props: Omit<ComponentProps<typeof Link>, 'href'> & { href: ExternalHref }) {
  return (
    <Link
      target="_blank"
      {...props}
      // expo-router typed routes expect typed paths; external URLs need a cast
      href={props.href as ComponentProps<typeof Link>['href']}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          e.preventDefault();
          WebBrowser.openBrowserAsync(props.href);
        }
      }}
    />
  );
}
