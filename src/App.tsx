/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SimpleAvatarStudio } from './components/SimpleAvatarStudio';
import { StudioAccess } from './components/StudioAccess';

export default function App() {
  return <StudioAccess><SimpleAvatarStudio /></StudioAccess>;
}
