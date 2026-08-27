//
// Created by Yuhao Wang on 2025/11/28.
//

#include <algorithm>
#include <numeric>
#include "spdlog/spdlog.h"
#include "DutyCodeAssignment.h"
#include "SegmentAggregationInfo.h"

std::vector<std::vector<DutyCode::DutyCode>> DutyCode::DutyCodeAssignment::GetDutyCode(
    const std::vector<Pairing*>& contextPairings, const std::vector<int>& pairingsIndices) const {

    std::map<int, std::vector<DutyCode>> tempResult;

    // 1. get the segments infos on the context & calculate the already assigned duty codes (excluding the ones in the pairingsIndices because we will be calculating them)
    auto segmentInfos = InitSegmentCoverData(contextPairings, pairingsIndices, true);

    // 2. Form the pairings list and sort the pairing in order (that is best for the assigning duty code) and preserve the order
    std::vector<std::pair<int, Pairing*>> pairingsWithOriginalIndex; // first - original location, second - pairing ptr
    pairingsWithOriginalIndex.reserve(pairingsIndices.size());
    for (const auto& index: pairingsIndices) {
        pairingsWithOriginalIndex.emplace_back(index, contextPairings.at(index));
    }
    const auto pairingOrder = GetOrderOfPairing(pairingsWithOriginalIndex);

    // 3. for each pairing needs to be calculated, calculate its duty code, temporarily store in map (to preserve order)

    for (const auto& order: pairingOrder) {
        const auto& pairing = contextPairings.at(order);
        tempResult[order] = std::move(GetDutyCodeForSinglePairing(pairing, contextPairings, segmentInfos));

        UpdateSegmentCoverData(segmentInfos, pairing, tempResult.at(order));
    }

    // 4. transform temp result to final one
    std::vector<std::vector<DutyCode>> result;
    result.reserve(pairingsIndices.size());
    for (const auto& index: pairingsIndices) {
        result.emplace_back(std::move(tempResult.at(index)));
    }

    return result;
}

std::vector<std::vector<bool>> DutyCode::DutyCodeAssignment::CheckDutyCode(
    const std::vector<Pairing *> &contextPairings, const std::vector<int> &pairingIndices) const {

    std::vector<std::vector<bool>> result;

    // 1. get the segments infos on the context & calculate the already assigned duty codes (including the ones in the pairingsIndices because we will be calculating them)
    const auto segmentInfos = InitSegmentCoverData(contextPairings, pairingIndices, false);
    const SegmentAggregationInfo nullSegmentAggregationInfo(0);
    // 2. check if individual segments in the need-to-be checked pairings one-by-one
    std::map<SegmentDivisionKey, bool> flySegmentBeenCheckedResult;
    for (const int pairingIndex : pairingIndices) {
        std::vector<bool> pairingResult;
        for (int j = 0; j < contextPairings.at(pairingIndex)->getSegmentsRead().size(); ++j) {
            const auto& segment = contextPairings.at(pairingIndex)->getSegmentsRead().at(j);
            if (_config.IsConsideredFlySegment(segment)) {
                // fly segment only needs to be checked once
                const auto segmentDivisionKey = FormSegmentDivisionKey(segment->getDBId(), contextPairings.at(pairingIndex)->getDivision());
                auto it = flySegmentBeenCheckedResult.find(segmentDivisionKey);
                if (it == flySegmentBeenCheckedResult.end()) {
                    const auto checkResult = CheckSegmentDutyCodeCompleteness(segment, pairingIndex, j, segmentInfos.at(segmentDivisionKey), contextPairings);
                    auto [insertIt, _] = flySegmentBeenCheckedResult.insert({segmentDivisionKey, checkResult});
                    it = insertIt;
                }
                pairingResult.emplace_back(it->second);
            } else {
                // non-fly segment could check for multiple times
                pairingResult.emplace_back(CheckSegmentDutyCodeCompleteness(segment, pairingIndex, j, nullSegmentAggregationInfo, contextPairings));
            }
        }
        result.emplace_back(std::move(pairingResult));
    }

    return result;

}

DutyCode::DutyCodeAssignment::SegmentAggregationInfoMap DutyCode::DutyCodeAssignment::InitSegmentCoverData(
    const std::vector<Pairing*>& contextPairings, const std::vector<int>& pairingsIndices, const bool excludingRefreshPairingDutyCode) const {

    SegmentAggregationInfoMap result;

    for (int i = 0; i < contextPairings.size(); ++i) {
        const auto& pairing = contextPairings.at(i);
        const auto& pairingDutyCodeType = pairing->GetAssignedDutyCode();
        const auto& segments = pairing->getSegmentsRead();
        bool recordDutyCode = true;
        if (excludingRefreshPairingDutyCode && std::find(pairingsIndices.begin(), pairingsIndices.end(), i) != pairingsIndices.end()) {
            recordDutyCode = false;
        }
        for (int j = 0; j < segments.size(); ++j) {
            const auto& segment = segments.at(j);
            if (!_config.IsConsideredFlySegment(segment)) continue; // ignoring non-fly segment for calculating segment aggregation info
            const auto segmentDivisionKey = FormSegmentDivisionKey(segment->getDBId(), pairing->getDivision());
            auto it = result.find(segmentDivisionKey);
            if (it == result.end()) {
                auto [newIt, _] = result.insert({segmentDivisionKey, SegmentAggregationInfo(segment->getDBId())});
                it = newIt;
            }
            it->second.PushComplementRankValue(pairing->GetComplements());
            it->second.PushPairingSegmentLocation(i, j);
            if (recordDutyCode && pairingDutyCodeType.size() > j) {
                // first check if the segment has been assigned with duty code, it could be empty, especially in PO
                if (const auto& segmentDutyCodeType = pairingDutyCodeType.at(j).GetDutyType();
                FlyDutyType.find(segmentDutyCodeType) != FlyDutyType.cend()) {
                    it->second.PushAssignedFlyDutyType(segmentDutyCodeType);
                } else {
                    it->second.PushAssignedNonFlyDutyType(segmentDutyCodeType);
                }
            }

        }
    }

    // after all pairings are processed, calculate the matched DutyCodeOption (could be multiple)
    for (auto& [segmentDivisionKey, info]: result) {
        _config.CalculateLinkedDutyCodeOption(info, segmentDivisionKey.second);
    }

    return result;
}

void DutyCode::DutyCodeAssignment::UpdateSegmentCoverData(SegmentAggregationInfoMap &infos, const Pairing *pairing,
    const std::vector<DutyCode> &pairingDutyCode) const {

    for (int i = 0; i < pairing->getSegmentsRead().size(); ++i) {
        const auto& segment = pairing->getSegmentsRead().at(i);
        if (!_config.IsConsideredFlySegment(segment)) continue;
        auto& info = infos.at(FormSegmentDivisionKey(segment->getDBId(), pairing->getDivision())); // guarantee success
        if (const auto& segmentDutyCodeType = pairingDutyCode.at(i).GetDutyType();
            FlyDutyType.find(segmentDutyCodeType) != FlyDutyType.cend()) {
            info.PushAssignedFlyDutyType(segmentDutyCodeType);
        } else {
            info.PushAssignedNonFlyDutyType(segmentDutyCodeType);
        }
    }
}

std::vector<int> DutyCode::DutyCodeAssignment::GetOrderOfPairing(const std::vector<std::pair<int, Pairing*>>& pairings) const {
    std::vector<std::pair<int, int>> sortPair; // first - original location, second - score by complement

    // 1. basic crew in front of augmented crew(single crew)
    // Note: there could be chances where pairing complement is not compatible with duty code assignment (e.g., 2CP+1FO pairing)
    // such pairing will be push in the front based on the number of crew they have
    std::unordered_map<int, Pairing*> locationMap;
    for (const auto& [originalIndex, pairing]: pairings) {
        locationMap.insert({originalIndex, pairing});
        // calculate complement score
        int score = 0;
        for (const auto& [rank, value]: pairing->GetComplements()) {
            const auto cit = _rankSortingOrder.find(rank);
            if (cit == _rankSortingOrder.cend()) continue;
            score += cit->second * value;
        }
        sortPair.emplace_back(originalIndex, score);
    }

    // 2. time ascending
    std::stable_sort(sortPair.begin(), sortPair.end(), [&locationMap](const std::pair<int, int>& prev, const std::pair<int, int>& next) {
        if (prev.second > next.second) return true;
        if (prev.second < next.second) return false;
        return locationMap.at(prev.first)->getStartTimeUtcSch() < locationMap.at(next.first)->getStartTimeUtcSch();
    });

    // 3. form the sorting order
    std::vector<int> order;
    order.reserve(sortPair.size());
    for (const auto& [sort, _]: sortPair) {
        order.emplace_back(sort);
    }

    return order;
}

std::vector<DutyCode::DutyCode> DutyCode::DutyCodeAssignment::GetDutyCodeForSinglePairing(const Pairing *pairing,
                                                                                          const std::vector<Pairing*>& contextPairings,
                                                                                          const SegmentAggregationInfoMap &segmentInfos) const {
    std::vector<DutyCode> result;

    // iterate each segment from the pairing
    int flySegmentCounting = 0;
    auto lastFlyingDutyType = DutyType::Unknown;
    for (int i = 0; i < pairing->getSegmentsRead().size(); ++i) {
        const auto& segment = pairing->getSegmentsRead().at(i);

        // Deadhead, Positioning, Standby .... , all kinds of non-fly segment will be handled in config
        if (_config.IsConsideredNonFlySegment(segment)) {
            result.emplace_back(std::move(_config.GetNonFlyDutyCode(segment, pairing)));
            continue;
        }

        if (!_config.IsConsideredFlySegment(segment)) { // unknown assignment type, return "Unknown" Duty code
            spdlog::warn("Segment {} with undefined assignment {} needs to calculate duty code, return unknown", segment->getDBId(), segment->getAssignment());
            result.emplace_back(std::move(_config.GetUnknownDutyCode()));
            continue;
        }

        // up to this point, it is fly segment
        if (!_config.IsAssignFlySegment()) {
            // if no need to assign fly segment duty code, assign EMPTY code
            result.emplace_back();
            continue;
        }
        ++flySegmentCounting;
        const auto& segmentInfo = segmentInfos.at(FormSegmentDivisionKey(segment->getDBId(), pairing->getDivision()));
        // check the linked duty code option
        const auto dutyCodeOptions = segmentInfo.GetDutyCodeOptions(); // guarantee to be successful
        if (dutyCodeOptions.empty()) {
            // this could happen if the segments are having different complement than duty code setting, return "Unknown" Duty code
            result.emplace_back(std::move(_config.GetUnknownDutyCode()));
            continue;
        }
        // get already assigned fly duty type for this segment
        const std::set<DutyType>& alreadyAssignedType = segmentInfo.GetAlreadyAssignedFlyDutyType();

        bool findFlightDutyCode = false;
        // iterate through possible duty code options
        const auto segmentRelatedPairing = GetSegmentRelatedPairings(segmentInfo, contextPairings);
        for (const auto& dutyCodeOption: dutyCodeOptions) {
            // check if all the pairings covering this segment satisfy the duty code Option rows, if not, try new duty code option
            // each duty code option represent a unique segment complement and the pairing complement combination
            if (!dutyCodeOption->CheckIfPairingComplementMatchRows(segmentRelatedPairing)) continue;

            // one duty code option may have multiple duty type combination, iterate through them

            // however, before iterating, sort the duty types so that the one that contains the TryGetNextAssignmentDutyType will be in the front
            std::vector<int> dutyTypeCodeSequence(dutyCodeOption->GetAllRequiredDutyTypes().size());
            std::iota(dutyTypeCodeSequence.begin(), dutyTypeCodeSequence.end(), 0);
            if (FlyDutyType.find(lastFlyingDutyType) != FlyDutyType.end() && lastFlyingDutyType != DutyType::ReliefPilotInCruise) {
                // if the last assigned duty type is unknown or RPIC, that is no need to sort the order
                auto nextDutyCode = DutyCodeConfig::GetNextAlternatingDutyType(lastFlyingDutyType);
                std::stable_sort(dutyTypeCodeSequence.begin(), dutyTypeCodeSequence.end(),
                    [&dutyCodeOption, &nextDutyCode](const int prevLoc, const int nextLoc) {
                        if (dutyCodeOption->GetAllRequiredDutyTypes().at(prevLoc).find(nextDutyCode) != dutyCodeOption->GetAllRequiredDutyTypes().at(prevLoc).end()
                            && dutyCodeOption->GetAllRequiredDutyTypes().at(nextLoc).find(nextDutyCode) == dutyCodeOption->GetAllRequiredDutyTypes().at(nextLoc).end()) {
                            return true;
                        }
                        return false;
                    });
            }
            for (const int dutyTypeCodeLoc :dutyTypeCodeSequence) {
                const auto& requiredDutyTypes = dutyCodeOption->GetAllRequiredDutyTypes().at(dutyTypeCodeLoc);
                // required duty types must be eligible for auto assignment
                if (!_config.IsApplicableForAutoAssignment(requiredDutyTypes)) continue;

                // from the already assigned duty type and the matched duty code options, calculate the remaining duty types needs to be assigned
                if (!std::includes(requiredDutyTypes.begin(), requiredDutyTypes.end(),
                    alreadyAssignedType.begin(), alreadyAssignedType.end())) {
                    // there is a duty type that's been already assigned about not present in the duty code option, log and continue
                    spdlog::trace("Already assigned duty type are outside the configuration, segment Id: {}, option name: {}, dutyTypeCodeLoc: {}", segment->getDBId(), dutyCodeOption->GetName(), dutyTypeCodeLoc);
                    continue;
                    }
                std::set<DutyType> remainingDutyType;
                std::set_difference(requiredDutyTypes.begin(), requiredDutyTypes.end(),
                    alreadyAssignedType.begin(), alreadyAssignedType.end(), std::inserter(remainingDutyType, remainingDutyType.end()));

                if (const auto matchedDutyCodeOptionRow = dutyCodeOption->GetDutyCodeRow(pairing->GetComplements());
                    !matchedDutyCodeOptionRow) {
                    spdlog::error("Passed required duty type but could not find matched duty code option row");
                } else {
                    const auto& dutyCodeMap = matchedDutyCodeOptionRow->GetDutyCodeRowDetail();
                    // decide the dutyType will be assigning
                    const auto dutyTypeToBeAssigned = DutyCodeConfig::TryGetNextAssignmentDutyType(flySegmentCounting, lastFlyingDutyType, remainingDutyType, pairing->GetComplements(), dutyCodeMap);
                    // could return unknown if matched error requiredDutyTypes, if so continue to try another one
                    if (dutyTypeToBeAssigned == DutyType::Unknown) continue;

                    const auto& dutyCodeStr= dutyCodeMap.at(dutyTypeToBeAssigned); // guarantee success
                    DutyCode code;
                    code.SetDutyType(dutyTypeToBeAssigned);
                    code.SetDutyCode(dutyCodeStr);
                    lastFlyingDutyType = dutyTypeToBeAssigned; // refresh the last fly duty type for the pairing
                    findFlightDutyCode = true;
                    result.emplace_back(std::move(code));
                    break;
                }
            }
            if (findFlightDutyCode) break;
        }

        // if no duty code option matched, return unknown, and modify the flying segment counting
        if (!findFlightDutyCode) {
            --flySegmentCounting;
            result.emplace_back(std::move(_config.GetUnknownDutyCode()));
        }
    }
    return result;
}

bool DutyCode::DutyCodeAssignment::CheckSegmentDutyCodeCompleteness(const Segment *segment, const int pairingIndex, const int segmentIndex,
    const SegmentAggregationInfo &segmentAggregationInfo, const std::vector<Pairing *> &contextPairings) const {

    constexpr auto RPICDutyType = DutyType::ReliefPilotInCruise;
    if (_config.IsConsideredFlySegment(segment)) {
        // if no need to assign fly segment duty code, always return true
        if (!_config.IsAssignFlySegment()) return true;
        // if fly, we need to check all the pairings which covers this segment, and check if all the pairings are
        // 1. individually follow the duty code configuration
        // 2. collectively make the segment duty code type complete
        // NOTE: RPIC is special duty type that can take any places and use as any duty code type

        // get the duty code assigned to this segment
        std::vector<std::pair<Pairing*, DutyCode>> allDutyCodesInSegment;
        std::set<DutyType> allCoveredType;
        for (const auto& [pairingIndex, segmentIndex]: segmentAggregationInfo.GetIncludedPairingSegmentLocation()) {
            const auto& pairing = contextPairings.at(pairingIndex);
            assert(_config.IsConsideredFlySegment(pairing->getSegmentsRead().at(segmentIndex)) && "segment aggregation info record non fly segment info");
            allDutyCodesInSegment.emplace_back(pairing, pairing->GetAssignedDutyCode().at(segmentIndex));
            allCoveredType.insert(pairing->GetAssignedDutyCode().at(segmentIndex).GetDutyType());
        }

        const auto segmentRelatedPairing = GetSegmentRelatedPairings(segmentAggregationInfo, contextPairings);
        // segment aggregation info shows the possible duty code options
        for (const auto& dutyCodeOption: segmentAggregationInfo.GetDutyCodeOptions()) {
            if (!dutyCodeOption->CheckIfPairingComplementMatchRows(segmentRelatedPairing)) continue; // could be multiple duty code option matched

            bool satisfiedIndividualPairing = true;
            // 1. individually follow the duty code configuration
            for (const auto& [pairing, dutyCode]: allDutyCodesInSegment) {
                // if the duty code is RPIC, ignore the individually check
                if (dutyCode.GetDutyType() == RPICDutyType) continue;
                if (const auto matchedDutyCodeRow = dutyCodeOption->GetDutyCodeRow(pairing->GetComplements());
                    !matchedDutyCodeRow) {
                    spdlog::error("Pairing passed the option complement setting but cannot find the option row, configuration error.");
                    satisfiedIndividualPairing = false;
                } else {
                    const auto rowDetail = matchedDutyCodeRow->GetDutyCodeRowDetail();
                    const auto cit = rowDetail.find(dutyCode.GetDutyType());
                    if (cit == rowDetail.cend()) {
                        satisfiedIndividualPairing = false; // single pairing doesn't match the row detail, segment failed
                    }
                    else {
                        if (cit->second != dutyCode.GetDutyCode()) {
                            satisfiedIndividualPairing = false; // single pairing doesn't match the duty code, segment failed
                        }
                    }
                }
                if (!satisfiedIndividualPairing) return false;
            }

            // 2. collectively make the segment duty code type complete

            for (const auto& requiredDutyTypeCombination: dutyCodeOption->GetAllRequiredDutyTypes()) {
                // quick check for length
                if (requiredDutyTypeCombination.size() != allCoveredType.size()) continue;
                // NOTE: because we have RPIC, we have to get the difference of the required - assigned and vice versa
                std::set<DutyType> requiredMinusAssigned;
                std::set<DutyType> assignedMinusRequired;
                std::set_difference(requiredDutyTypeCombination.cbegin(), requiredDutyTypeCombination.cend(),
                    allCoveredType.cbegin(), allCoveredType.cend(),
                    std::inserter(requiredMinusAssigned, requiredMinusAssigned.end()));
                std::set_difference(allCoveredType.cbegin(), allCoveredType.cend(),
                    requiredDutyTypeCombination.cbegin(), requiredDutyTypeCombination.cend(),
                    std::inserter(assignedMinusRequired, assignedMinusRequired.end()));

                // check if is identical
                if (requiredMinusAssigned.empty() && assignedMinusRequired.empty()) return true;
                // up to this point, RPIC may appear and act as wildcard
                if (assignedMinusRequired.find(RPICDutyType) == assignedMinusRequired.end()) continue;
                if (assignedMinusRequired.size() >= 2) continue; // check if the assigned minus required produce non-RPIC duty type, that's a mismatch
                // up to this point, assigned is size 1 and must contain RPIC, if the required minus assigned also have one element and can be swapped by RPIC, also return true;
                if (requiredMinusAssigned.size() == 1 && _config.IsDutyCodeRPICSwappable(*requiredMinusAssigned.begin())) return true;
            }
            // all covered duty type doesn't match any of the duty code option combinations, continue to check next duty code option
        }
        // up to this point, no duty code option matched
        return false;
    }
    if (_config.IsConsideredNonFlySegment(segment)) {
        // see if the duty code type match the newly assigned one for non-fly segment
        const auto& placedDutyCode = contextPairings.at(pairingIndex)->GetAssignedDutyCode().at(segmentIndex);
        const auto dutyCode = _config.GetNonFlyDutyCode(segment, contextPairings.at(pairingIndex));
        return dutyCode.GetDutyType() == placedDutyCode.GetDutyType() && dutyCode.GetDutyCode() == placedDutyCode.GetDutyCode();
    }

    spdlog::warn("Segment {} with undefined assignment {} needs to check duty code, return false", segment->getDBId(), segment->getAssignment());
    return false;
}

DutyCode::DutyCodeAssignment::SegmentDivisionKey DutyCode::DutyCodeAssignment::FormSegmentDivisionKey(
    const long long segmentId, const std::string &division) {
    return {segmentId, division};
}

std::vector<const Pairing *> DutyCode::DutyCodeAssignment::GetSegmentRelatedPairings(
    const SegmentAggregationInfo &segmentAggregationInfo, const std::vector<Pairing *> &contextPairings) {
    std::vector<const Pairing*> segmentRelatedPairing;
    for (const auto& [pairingIndex, _]: segmentAggregationInfo.GetIncludedPairingSegmentLocation()) {
        segmentRelatedPairing.emplace_back(contextPairings.at(pairingIndex));
    }
    return segmentRelatedPairing;
}
