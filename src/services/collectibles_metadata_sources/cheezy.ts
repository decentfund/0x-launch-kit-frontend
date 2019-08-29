import { ERC721TokenEvents } from '@0x/contract-wrappers';
import abiDecoder from 'abi-decoder';
import { RateLimit } from 'async-sema';

import { COLLECTIBLE_ADDRESS, NETWORK_ID, OPENSEA_API_KEY } from '../../common/constants';
import { getContractWrappers } from '../../services/contract_wrappers';
import { getWeb3Wrapper } from '../../services/web3_wrapper';
import { Collectible, CollectibleMetadataSource } from '../../util/types';

export class Cheezy implements CollectibleMetadataSource {
    private readonly _rateLimit: () => Promise<void>;

    private readonly _endpointsUrls: { [key: number]: string } = {
        1: 'https://api.opensea.io/api/v1',
        4: 'https://rinkeby-api.opensea.io/api/v1',
        // Add endpoint for development network with ID 50 (default in 0x-project-launch-kit)
        50: 'https://api.opensea.io/api/v1',
    };

    public static getAssetsAsCollectible(assets: any[], userAddress?: string): Collectible[] {
        return assets.map((asset: any) => {
            return Cheezy.getAssetAsCollectible(asset, userAddress);
        });
    }

    public static getAssetAsCollectible(asset: any, userAddress?: string): Collectible {
        return {
            tokenId: asset.token_id,
            name: asset.name || `${asset.asset_contract.name} - #${asset.token_id}`,
            color: asset.background_color ? `#${asset.background_color}` : '',
            image: asset.image_url,
            // Substituting owner for current user address
            currentOwner: userAddress ? userAddress : asset.owner.address,
            assetUrl: asset.external_link,
            description: asset.name,
            order: null,
        };
    }

    constructor(options: { rps: number }) {
        this._rateLimit = RateLimit(options.rps); // requests per second
    }

    public async fetchAllUserCollectiblesAsync(userAddress: string): Promise<Collectible[]> {
        const metadataSourceUrl = this._endpointsUrls[NETWORK_ID];
        // changed contract address for mainnet cheeze wizards
        const contractAddress = '0x2f4bdafb22bd92aa7b7552d270376de8edccbc1e';

        // getting transfer events for local development
        const contractWrappers = await getContractWrappers();
        const web3Wrapper = await getWeb3Wrapper();
        const latestBlock = await web3Wrapper.getBlockNumberAsync();

        abiDecoder.addABI([{
          'anonymous': false,
          'inputs': [
            {
              'indexed': false,
              'name': 'from',
              'type': 'address',
            },
            {
              'indexed': false,
              'name': 'to',
              'type': 'address',
            },
            {
              'indexed': false,
              'name': 'wizardId',
              'type': 'uint256',
            },
          ],
          'name': 'Transfer',
          'type': 'event',
        },
        ]);
        const events = await contractWrappers.erc721Token.getLogsAsync(
            COLLECTIBLE_ADDRESS,
            ERC721TokenEvents.Transfer,
            {
                fromBlock: 0,
                toBlock: latestBlock,
            },
            { },
        );
        const logs = abiDecoder.decodeLogs(events);
        // parsing ids from Transfer events
        const tokenIds = logs.filter((l: any) => l.events.some((e: any) => e.name === 'to' && e.value === userAddress)).map((l: any) => l.events.find((e: any) => e.name === 'wizardId').value);

        // fetching assets by its ids
        const tokenIdsQueryParam = tokenIds.map((id: string) => `token_ids=${id}`).join('&');
        const url = `${metadataSourceUrl}/assets?asset_contract_address=${contractAddress}&${tokenIdsQueryParam}`;
        const assetsResponse = await this._fetch(url);
        const assetsResponseJson = await assetsResponse.json();
        return Cheezy.getAssetsAsCollectible(assetsResponseJson.assets, userAddress);
    }

    public async fetchCollectiblesAsync(tokenIds: string[]): Promise<Collectible[]> {
        const metadataSourceUrl = this._endpointsUrls[NETWORK_ID];
        // changed contract address for mainnet cheeze wizards
        const contractAddress = '0x2f4bdafb22bd92aa7b7552d270376de8edccbc1e';
        const tokenIdsQueryParam = tokenIds.map((id: string) => `token_ids=${id}`).join('&');
        const url = `${metadataSourceUrl}/assets?asset_contract_address=${contractAddress}&${tokenIdsQueryParam}`;
        const assetsResponse = await this._fetch(url);
        const assetsResponseJson = await assetsResponse.json();
        return Cheezy.getAssetsAsCollectible(assetsResponseJson.assets);
    }

    private readonly _fetch = async (url: string) => {
        await this._rateLimit();
        return fetch(url, {
            headers: { 'X-API-KEY': OPENSEA_API_KEY || '' } as any,
        });
    };
}
