import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './store';
import { DemoOverlay } from './components/DemoOverlay';

import Overview from './pages/Overview';
import P1_AskXiaotuan from './pages/P1_AskXiaotuan';
import Step2_Identity from './pages/Step2_Identity';
import Step3_Picker from './pages/Step3_Picker';
import Step4_Rerank from './pages/Step4_Rerank';
import Step5_Preview from './pages/Step5_Preview';
import Step6_Order from './pages/Step6_Order';
import Step7_Board from './pages/Step7_Board';
import Step8_BoardMap from './pages/Step8_BoardMap';
import Summary from './pages/Summary';
import Kevin from './pages/Kevin';
import Flow from './pages/Flow';
import Review from './pages/Review';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Overview />} />

          {/* 8-step numbered demo flow */}
          <Route path="/p1" element={<P1_AskXiaotuan />} />
          <Route path="/p2" element={<Step2_Identity />} />
          <Route path="/p3" element={<Step3_Picker />} />
          <Route path="/p4" element={<Step4_Rerank />} />
          <Route path="/p5" element={<Step5_Preview />} />
          <Route path="/p6" element={<Step6_Order />} />
          <Route path="/p7" element={<Step7_Board />} />
          <Route path="/p8" element={<Step8_BoardMap />} />

          {/* Named alias routes */}
          <Route path="/identity"  element={<Step2_Identity />} />
          <Route path="/picker"    element={<Step3_Picker />} />
          <Route path="/rerank"    element={<Step4_Rerank />} />
          <Route path="/preview"   element={<Step5_Preview />} />
          <Route path="/order"     element={<Step6_Order />} />
          <Route path="/board"     element={<Step7_Board />} />
          <Route path="/board-map" element={<Step8_BoardMap />} />
          <Route path="/summary"   element={<Summary />} />

          {/* Standalone pages */}
          <Route path="/kevin"  element={<Kevin />} />
          <Route path="/flow"   element={<Flow />} />
          <Route path="/review" element={<Review />} />

          <Route path="*" element={<Overview />} />
        </Routes>
        <DemoOverlay />
      </HashRouter>
    </AppProvider>
  );
}
