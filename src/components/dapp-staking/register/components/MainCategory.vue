<template>
  <items-container :title="$t('dappStaking.modals.categoryTitle')" class="component">
    <div class="container--radio">
      <q-radio
        v-for="(category, index) in possibleCategories"
        :key="index"
        v-model="data.mainCategory"
        :val="category.value"
        :label="category.label"
        dense
        class="radio"
      />
    </div>
  </items-container>
</template>

<script lang="ts">
import { Category, NewDappItem } from 'src/store/dapp-staking/state';
import { defineComponent, PropType, reactive } from 'vue';
import ItemsContainer from './ItemsContainer.vue';

export const possibleCategories = [
  { label: 'DeFi', value: 'defi' },
  { label: 'NFT', value: 'nft' },
  { label: 'Tooling', value: 'tooling' },
  { label: 'Utility', value: 'utility' },
  { label: 'Others', value: 'others' },
];

export default defineComponent({
  components: {
    ItemsContainer,
  },
  props: {
    dapp: {
      type: Object as PropType<NewDappItem>,
      required: true,
    },
  },
  setup(props) {
    const data = reactive<NewDappItem>(props.dapp);

    const handleItemToggled = (selectedItems: string[]): void => {
      data.mainCategory = selectedItems[0] as Category;
    };

    return {
      data,
      possibleCategories,
      handleItemToggled,
    };
  },
});
</script>

<style lang="scss" scoped>
@use '../styles/register.scss';
</style>
