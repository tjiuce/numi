import Main from './pages/Main';
import { TransferProvider } from './store/transferStore';

function App() {
  return (
    <TransferProvider>
      <Main />
    </TransferProvider>
  );
}

export default App;
