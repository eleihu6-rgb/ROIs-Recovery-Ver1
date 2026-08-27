//
// Created by Yuhao Wang on 2025/11/28.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_SEGMENTAGGREGATIONINFO_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_SEGMENTAGGREGATIONINFO_H

#include <string>
#include <map>
#include "DutyCodeOption.h"

namespace DutyCode {
    class SegmentAggregationInfo {
    public:
        explicit SegmentAggregationInfo(const long long id): _segmentId(id) {}

        void PushPairingSegmentLocation(const int pairingLocation, const int segmentLocation) {
            _includedPairingSegmentLocation[pairingLocation] = segmentLocation;
        }

        void PushComplementRankValue(const std::map<std::string, int>& pairingComplement) {
            for (const auto& [rank, value]: pairingComplement) {
                if (value <= 0) continue; // no 0 value will be added
                _complementRankValue[rank] += value;
            }
        }

        void PushLinkedDutyCodeOption(const DutyCodeOption* dutyCodeOption) { _linkedDutyCodeOptions.emplace_back(dutyCodeOption); }
        void PushAssignedFlyDutyType(const DutyType dutyType) { _alreadyAssignedFlyDutyType.insert(dutyType); }
        void PushAssignedNonFlyDutyType(const DutyType dutyType) { _alreadyAssignedNonFlyDutyType.insert(dutyType); }

        [[nodiscard]] long long GetSegmentId() const { return _segmentId; }
        [[nodiscard]] const std::vector<const DutyCodeOption*>& GetDutyCodeOptions() const { return _linkedDutyCodeOptions; }

        [[nodiscard]] const std::map<std::string, int>& GetComplement() const { return _complementRankValue; }
        [[nodiscard]] const std::map<int, int>& GetIncludedPairingSegmentLocation() const { return _includedPairingSegmentLocation; }
        [[nodiscard]] const std::set<DutyType>& GetAlreadyAssignedFlyDutyType() const { return _alreadyAssignedFlyDutyType; }
        [[nodiscard]] const std::set<DutyType>& GetAlreadyAssignedNonFlyDutyType() const { return _alreadyAssignedNonFlyDutyType; }

    private:
        long long _segmentId;
        std::map<std::string, int> _complementRankValue;
        std::vector<const DutyCodeOption*> _linkedDutyCodeOptions;
        std::map<int, int> _includedPairingSegmentLocation;
        std::set<DutyType> _alreadyAssignedFlyDutyType;
        std::set<DutyType> _alreadyAssignedNonFlyDutyType;
    };
}

#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_SEGMENTAGGREGATIONINFO_H