<template>
  <div v-if="currentNetworkChain === astarChain.SHIDEN">
    <img src="~assets/img/shiden_logo_luna.png" width="200" height="44" />
  </div>
  <div v-else-if="currentNetworkChain === astarChain.SHIBUYA">
    <img src="~assets/img/shibuya_logo.png" width="152" height="55" />
  </div>
  <img
    v-else-if="currentNetworkChain === astarChain.ASTAR"
    src="~assets/img/astar_logo_luna.png"
    width="190"
    height="78"
  />
  <div v-else></div>
</template>
<script lang="ts">
import { endpointKey } from 'src/config/chainEndpoints';
import { useNetworkInfo } from 'src/hooks';
import { defineComponent } from 'vue';
import { astarChain } from 'src/config/chain';

export default defineComponent({
  setup() {
    const { currentNetworkChain } = useNetworkInfo();

    return {
      currentNetworkChain,
      endpointKey,
      astarChain,
    };
  },
});
</script>
