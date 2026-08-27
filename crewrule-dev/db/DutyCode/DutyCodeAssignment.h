//
// Created by Yuhao Wang on 2025/11/28.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEASSIGNMENT_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEASSIGNMENT_H

#include "Pairing.h"
#include "DutyCode.h"
#include "DutyCodeConfig.h"

namespace DutyCode{
    class DutyCodeAssignment {
    public:
        explicit DutyCodeAssignment() = default;

        /*
         *  contextPairing are pairings that are related to pairings which need to be assigned with duty code
         *  refreshing indices are vector of index for pairing wish to refresh (or auto assign) duty codes, the index is linked with contextPairings
         *  NOTE: pairings with refreshing indices will clear the previous assigned duty codes
         */
        [[nodiscard]] std::vector<std::vector<DutyCode>> GetDutyCode(const std::vector<Pairing*>& contextPairings, const std::vector<int>& pairingsIndices) const;

        [[nodiscard]] std::vector<std::vector<bool>> CheckDutyCode(const std::vector<Pairing*>& contextPairings, const std::vector<int>& pairingIndices) const;

        void SetDutyCodeConfig(DutyCodeConfig config) { _config = std::move(config); }

    private:
        using SegmentDivisionKey = std::pair<long long, std::string>;
        using SegmentAggregationInfoMap = std::map<SegmentDivisionKey, SegmentAggregationInfo>;

        // process the pairings so that segments are clear about their covered complements and included parings
        [[nodiscard]] SegmentAggregationInfoMap InitSegmentCoverData(const std::vector<Pairing*>& contextPairings, const std::vector<int>& pairingsIndices, bool excludingRefreshPairingDutyCode) const;
        void UpdateSegmentCoverData(SegmentAggregationInfoMap& infos, const Pairing* pairing, const std::vector<DutyCode>& pairingDutyCode) const;
        // sort the pairing in order that it's easier for assigning duty code
        [[nodiscard]] std::vector<int> GetOrderOfPairing(const std::vector<std::pair<int, Pairing*>>& pairings) const;

        // get duty code for one pairing from the segment info and current duty code result
        [[nodiscard]] std::vector<DutyCode> GetDutyCodeForSinglePairing(const Pairing* pairing, const std::vector<Pairing*>& contextPairings, const SegmentAggregationInfoMap& segmentInfos) const;

        //
        [[nodiscard]] bool CheckSegmentDutyCodeCompleteness(const Segment* segment, int pairingIndex, int segmentIndex, const SegmentAggregationInfo& segmentAggregationInfo, const std::vector<Pairing*>& contextPairings) const;


        // helper functions - to get all segment related pairing ptr vector
        [[nodiscard]] static SegmentDivisionKey FormSegmentDivisionKey(long long segmentId, const std::string& division);
        [[nodiscard]] static std::vector<const Pairing*> GetSegmentRelatedPairings(const SegmentAggregationInfo& segmentAggregationInfo, const std::vector<Pairing*>& contextPairings);
        DutyCodeConfig _config;
        std::map<std::string, int> _rankSortingOrder = {{"CPT", 2}, {"FO", 1}};
    };
}



#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEASSIGNMENT_H
