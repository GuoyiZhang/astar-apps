import { $api, $web3 } from 'boot/api';
import { ethers } from 'ethers';
import ABI from 'src/config/abi/ERC20.json';
import { getTokenBal, isValidEvmAddress, toSS58Address } from 'src/config/web3';
import { useGasPrice, useNetworkInfo } from 'src/hooks';
import {
  ASTAR_SS58_FORMAT,
  isValidAddressPolkadotAddress,
  SUBSTRATE_SS58_FORMAT,
} from 'src/hooks/helper/plasmUtils';
import { useAccount } from 'src/hooks/useAccount';
import { HistoryTxType } from 'src/modules/account';
import { addTxHistories } from 'src/modules/account/utils/index';
import { sampleEvmWalletAddress } from 'src/modules/gas-api';
import { getEvmGasCost } from 'src/modules/gas-api/utils/index';
import { fetchXcmBalance } from 'src/modules/xcm';
import { Path } from 'src/router';
import { useStore } from 'src/store';
import { container } from 'src/v2/common';
import { Asset } from 'src/v2/models';
import { ITokenTransferService } from 'src/v2/services';
import { Symbols } from 'src/v2/symbols';
import { computed, ref, Ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { AbiItem } from 'web3-utils';

export function useTokenTransfer(selectedToken: Ref<Asset>) {
  const transferAmt = ref<string | null>(null);
  const toAddressBalance = ref<number>(0);
  const toAddress = ref<string>('');
  const errMsg = ref<string>('');
  const isChecked = ref<boolean>(false);

  const store = useStore();
  const { currentAccount } = useAccount();
  const {
    evmGasPrice,
    selectedGas,
    setSelectedGas,
    evmGasCost,
    selectedTip,
    nativeTipPrice,
    setSelectedTip,
  } = useGasPrice();
  const route = useRoute();
  const router = useRouter();

  const { nativeTokenSymbol, evmNetworkIdx } = useNetworkInfo();
  const isH160 = computed<boolean>(() => store.getters['general/isH160Formatted']);
  const tokenSymbol = computed<string>(() => route.query.token as string);
  const isLoading = computed<boolean>(() => store.getters['general/isLoading']);

  const isTransferNativeToken = computed<boolean>(
    () => tokenSymbol.value === nativeTokenSymbol.value.toLowerCase()
  );

  const isRequiredCheck = computed<boolean>(() => isH160.value || !isTransferNativeToken.value);

  const fromAddressBalance = computed<number>(() =>
    selectedToken.value ? selectedToken.value.userBalance : 0
  );

  const isDisabledTransfer = computed<boolean>(() => {
    const isLessAmount =
      0 >= Number(transferAmt.value) || fromAddressBalance.value < Number(transferAmt.value);
    const noAddress = !toAddress.value;
    return (
      errMsg.value !== '' ||
      isLessAmount ||
      noAddress ||
      (isRequiredCheck.value && !isChecked.value)
    );
  });

  const isValidDestAddress = computed<boolean>(() => {
    const isOnlyAcceptEvmAddress = isH160.value && !isTransferNativeToken.value;
    return isOnlyAcceptEvmAddress
      ? isValidEvmAddress(toAddress.value)
      : isValidAddressPolkadotAddress(toAddress.value, ASTAR_SS58_FORMAT) ||
          isValidAddressPolkadotAddress(toAddress.value, SUBSTRATE_SS58_FORMAT) ||
          isValidEvmAddress(toAddress.value);
  });

  const inputHandler = (event: any): void => {
    transferAmt.value = event.target.value;
    errMsg.value = '';
  };

  const resetStates = (): void => {
    transferAmt.value = '';
    toAddress.value = '';
    errMsg.value = '';
    isChecked.value = false;
    toAddressBalance.value = 0;
  };

  const finalizedCallback = (hash: string): void => {
    addTxHistories({
      hash: String(hash),
      type: HistoryTxType.Transfer,
      address: currentAccount.value,
    });
    router.push(Path.Assets);
  };

  const toMaxAmount = async (): Promise<void> => {
    transferAmt.value = String(selectedToken.value.userBalance);
  };

  const setErrorMsg = (): void => {
    if (isLoading.value) return;
    const transferAmtRef = Number(transferAmt.value);
    try {
      if (transferAmtRef > fromAddressBalance.value) {
        errMsg.value = 'warning.insufficientBalance';
      } else if (toAddress.value && !isValidDestAddress.value) {
        errMsg.value = 'warning.inputtedInvalidDestAddress';
      } else {
        errMsg.value = '';
      }
    } catch (error: any) {
      errMsg.value = error.message;
    }
  };

  const transferAsset = async ({
    transferAmt,
    toAddress,
    symbol,
  }: {
    transferAmt: number;
    toAddress: string;
    symbol: string;
  }): Promise<void> => {
    if (!selectedToken?.value) {
      throw Error('Token is not selected');
    }

    const receivingAddress = isValidEvmAddress(toAddress) ? toSS58Address(toAddress) : toAddress;
    const decimals = Number(selectedToken.value.metadata.decimals);
    const amount = ethers.utils.parseUnits(String(transferAmt), decimals).toString();

    try {
      const tokenTransferService = container.get<ITokenTransferService>(
        Symbols.TokenTransferService
      );
      if (isH160.value) {
        await tokenTransferService.transferEvmAsset({
          senderAddress: currentAccount.value,
          toAddress,
          amount: String(transferAmt),
          contractAddress: selectedToken.value.mappedERC20Addr,
          decimals,
          finalizedCallback,
        });
      } else {
        await tokenTransferService.transferNativeAsset({
          assetId: selectedToken.value.id,
          senderAddress: currentAccount.value,
          receivingAddress: receivingAddress,
          amount,
          finalizedCallback,
        });
      }
    } catch (e: any) {
      console.error(e);
      store.dispatch('general/showAlertMsg', {
        msg: e.message || 'Something went wrong during asset transfer.',
        alertType: 'error',
      });
      store.commit('general/setLoading', false);
    }
  };

  const getNativeTokenBalance = async (address: string): Promise<number> => {
    const web3Ref = $web3.value;
    const apiRef = $api;
    if (!apiRef || !address || !web3Ref) return 0;
    if (isValidAddressPolkadotAddress(address)) {
      const { data } = await apiRef.query.system.account(address);
      return Number(ethers.utils.formatEther(data.free.toString()));
    }
    if (ethers.utils.isAddress(address)) {
      const balance = await web3Ref.eth.getBalance(address);
      return Number(ethers.utils.formatEther(balance));
    }
    return 0;
  };

  const setToAddressBalance = async (): Promise<void> => {
    if (!isValidDestAddress.value) {
      toAddressBalance.value = 0;
      return;
    }

    const isSendToH160 = isValidEvmAddress(toAddress.value);
    const destAddress = isSendToH160 ? toSS58Address(toAddress.value) : toAddress.value;
    const srcChainId = evmNetworkIdx.value;

    if (isTransferNativeToken.value) {
      toAddressBalance.value = await getNativeTokenBalance(destAddress);
    } else if (isH160.value) {
      const balance = await getTokenBal({
        srcChainId,
        address: toAddress.value,
        tokenAddress: selectedToken.value.mappedERC20Addr,
        tokenSymbol: selectedToken.value.metadata.symbol,
      });
      toAddressBalance.value = Number(balance);
    } else {
      const { userBalance } = await fetchXcmBalance({
        token: selectedToken.value,
        userAddress: destAddress,
        api: $api!,
      });
      toAddressBalance.value = Number(userBalance);
    }
  };

  const setEvmGasCost = async (): Promise<void> => {
    if (!selectedGas.value || !isH160.value) return;
    try {
      const isErc20 = !isTransferNativeToken.value;
      const transferAmtRef = transferAmt.value || '0';
      const value = isErc20 ? '0x0' : transferAmtRef;
      const destination = ethers.utils.isAddress(toAddress.value)
        ? toAddress.value
        : sampleEvmWalletAddress;

      const destAddress = isErc20 ? selectedToken.value.mappedERC20Addr : destination;
      const contract = isErc20
        ? new $web3.value!.eth.Contract(ABI as AbiItem[], selectedToken.value.mappedERC20Addr)
        : undefined;

      const encodedData = isErc20
        ? contract!.methods
            .transfer(
              destination,
              ethers.utils.parseUnits(transferAmtRef, selectedToken.value.metadata.decimals)
            )
            .encodeABI()
        : undefined;

      evmGasCost.value = await getEvmGasCost({
        isNativeToken: !isErc20,
        evmGasPrice: evmGasPrice.value,
        fromAddress: currentAccount.value,
        toAddress: destAddress,
        web3: $web3.value!,
        value,
        encodedData,
      });
    } catch (error) {
      console.error(error);
    }
  };

  watchEffect(setErrorMsg);
  watchEffect(setToAddressBalance);
  watchEffect(setEvmGasCost);
  watch([tokenSymbol], resetStates);

  return {
    selectedTip,
    nativeTipPrice,
    transferAmt,
    toAddressBalance,
    fromAddressBalance,
    toAddress,
    errMsg,
    isDisabledTransfer,
    isChecked,
    isH160,
    isTransferNativeToken,
    selectedGas,
    evmGasCost,
    isRequiredCheck,
    setSelectedGas,
    setSelectedTip,
    inputHandler,
    resetStates,
    toMaxAmount,
    transferAsset,
  };
}
