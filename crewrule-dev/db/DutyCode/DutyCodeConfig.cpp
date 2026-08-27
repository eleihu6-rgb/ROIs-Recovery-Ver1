//
// Created by Yuhao Wang on 2025/11/28.
//

#include <algorithm>
#include <spdlog/spdlog.h>
#include "DutyCodeConfig.h"

#include "UtilFunc.h"

const std::set<DutyCode::DutyType> DutyCode::DutyCodeConfig::RPICSwappableDutyType = {
    DutyType::CommandingCaptain,
    DutyType::CommandingFirstOfficer,
    DutyType::CommandingBasic,
    DutyType::AugmentingCaptain,
    DutyType::AugmentingFirstOfficer,
    DutyType::AugmentingBasic
};

DutyCode::DutyCodeConfig::DutyCodeConfig() {
    PushFlyAssignment("FLY");
    PushNonFlyAssignment("SBY");
    PushNonFlyAssignment("DHD");
    PushNonFlyAssignment("TRAIN");
}

void DutyCode::DutyCodeConfig::CalculateLinkedDutyCodeOption(SegmentAggregationInfo &info, const std::string& division) const {


    for (const auto& dutyCodeOption: _flyDutyCodeOptions) {
        if (!dutyCodeOption.CheckIfDivisionMatch(division)) continue;
        if (dutyCodeOption.CheckIfSegmentComplementMatch(info.GetComplement())) {
            info.PushLinkedDutyCodeOption(&dutyCodeOption);
        }
    }
    if (_assignFlySegment && info.GetDutyCodeOptions().empty()) {
        // form a complement string for debug
        std::string complementString;
        for (const auto& [rank, value]: info.GetComplement()) {
            complementString.append(rank);
            complementString.push_back(':');
            complementString.append(std::to_string(value));
            complementString.push_back(',');
        }
        complementString.pop_back();

        spdlog::debug("Segment Id: {} could not find linked duty code option, complement: {}", info.GetSegmentId(), complementString);
    }
}

void DutyCode::DutyCodeConfig::BuildDutyCodeConfig(const std::vector<std::shared_ptr<DutyCodeTypeComp>> &dutyCodeTypeCompositionVec,
    const std::unordered_map<long long, std::vector<std::shared_ptr<DutyCodeLogic>>> &dutyCodeLogicMap) {

    for (const auto& dutyCodeComposition: dutyCodeTypeCompositionVec) {
        // check if is non-fly duty code type
        if (IsConsideredNonFlySegment(dutyCodeComposition->dutyAssignment)) {
            // find all duty code logic related to this duty code composition
            const auto& dutyCodeLogicVec = dutyCodeLogicMap.at(dutyCodeComposition->id);
            for (const auto& dutyCodeLogic: dutyCodeLogicVec) {
                auto depSet = SplitStringToSet(dutyCodeLogic->dep, '|');
                auto arrSet = SplitStringToSet(dutyCodeLogic->arr, '|');
                DutyCodeSegmentFilter filter;
                for (const auto& dep: depSet) {
                    if (dep != "*") {
                        filter.PushDepartureStation(dep);
                    }
                }
                for (const auto& arr: arrSet) {
                    if (arr != "*") {
                        filter.PushArrivalStation(arr);
                    }
                }
                filter.SetCheckOnlyAssignmentDhdDuty(dutyCodeLogic->isSingleSeg);
                if (const auto dutyType = GetMappedDutyType(dutyCodeLogic->dutyCodeType); dutyType == DutyType::Empty) {
                    spdlog::error("Unrecognized Duty Code Type Input: {}", dutyCodeLogic->dutyCodeType);
                } else {
                    SetNonFlyAssignmentDutyCode(dutyCodeComposition->dutyAssignment, dutyType, dutyCodeLogic->dutyCode, dutyCodeComposition->division, std::move(filter), dutyCodeLogic->priority);
                }
            }
        } else if (IsConsideredFlySegment(dutyCodeComposition->dutyAssignment)) {
            DutyCodeOption option;
            option.SetName(dutyCodeComposition->name);
            option.SetDivision(dutyCodeComposition->division);
            // set segment composition
            const auto& segmentComp = dutyCodeComposition->comp;
            auto [segmentCompositionCaptain, segmentCompositionFirstOfficer] = GetCountPilotRankFromSegmentCompositionString(segmentComp);
            option.SetSegmentComposition({{"CPT", segmentCompositionCaptain}, {"FO", segmentCompositionFirstOfficer}});
            // set pairing composition combination
            const auto& pairingCompSet = dutyCodeComposition->reqPairCompCoutList;
            for (const auto& pairingComp: pairingCompSet) {
                auto [count, pairingCompositionCaptain, pairingCompositionFirstOfficer] = GetCountPilotRankFromPairingCompositionString(pairingComp);
                option.PushPairingCompositionCount({{"CPT", pairingCompositionCaptain}, {"FO", pairingCompositionFirstOfficer}}, count);
            }
            // set all required duty types
            const auto& allDutyTypesSet = dutyCodeComposition->reqDutyCodeTypeCompList;
            for (const auto& allDutyTypes: allDutyTypesSet) {
                option.PushAllRequiredDutyType(GetDutyTypeCombinationFromString(allDutyTypes));
            }

            // set all pairing composition linked duty code types
            const auto& dutyCodeLogicVec = dutyCodeLogicMap.at(dutyCodeComposition->id);
            std::map<std::string, DutyCodeOptionRow> dutyCodeOptions;
            for (const auto& dutyCodeLogic: dutyCodeLogicVec) {
                // pairing composition in duty code logic and segment composition in duty code type comp share the same logic
                auto [pairingCompositionCaptain, pairingCompositionFirstOfficer] = GetCountPilotRankFromSegmentCompositionString(dutyCodeLogic->pairComp);
                const std::map<std::string, int> pairingComposition {{"CPT", pairingCompositionCaptain}, {"FO", pairingCompositionFirstOfficer}};
                std::string compositionIdentifier = DutyCodeOption::FormComplementIdentifier(pairingComposition);
                auto it = dutyCodeOptions.find(compositionIdentifier);
                if (it == dutyCodeOptions.end()) {
                    // not found, create a new one
                    DutyCodeOptionRow row(pairingComposition);
                    auto [insertIt, _] = dutyCodeOptions.insert({compositionIdentifier, std::move(row)});
                    it = insertIt;
                }
                // record the dutyCodeType and dutyCode
                it->second.PushDutyCode(GetMappedDutyType(dutyCodeLogic->dutyCodeType), dutyCodeLogic->dutyCode);
            }
            option.SetDutyCodeOptionRows(std::move(dutyCodeOptions));
            PushFlyDutyCodeOptions(std::move(option));
        } else {
            spdlog::error("Unrecognized Segment Assignment Input: {}", dutyCodeComposition->dutyAssignment);
        }
    }

    // after all done, sort the non-fly assignment duty code logic using priority
    for (auto& [_, dutyCodeLogics]: _nonFlyAssignmentDutyCode) {
        std::stable_sort(dutyCodeLogics.begin(), dutyCodeLogics.end(),
        [](const NonFlyAssignmentDutyCodeLogic& prev,
            const NonFlyAssignmentDutyCodeLogic& next) {
            return prev.priority < next.priority;
        });
    }
}

bool DutyCode::DutyCodeConfig::IsConsideredFlySegment(const Segment *segment) const {
    const auto& assignment = segment->getAssignment();
    return IsConsideredFlySegment(assignment);
}

bool DutyCode::DutyCodeConfig::IsConsideredNonFlySegment(const Segment *segment) const {
    const auto& assignment = segment->getAssignment();
    return IsConsideredNonFlySegment(assignment);
}

bool DutyCode::DutyCodeConfig::IsApplicableForAutoAssignment(
    const std::set<DutyType> &needToBeAssignedDutyTypeCombination) const {

    const auto cit = std::find_first_of(_avoidAutoAssignedDutyTypes.cbegin(), _avoidAutoAssignedDutyTypes.cend(),
                                     needToBeAssignedDutyTypeCombination.cbegin(), needToBeAssignedDutyTypeCombination.cend());

    // not contain any avoid duty types, pass to auto assignment
    return cit == _avoidAutoAssignedDutyTypes.end();
}

DutyCode::DutyCode DutyCode::DutyCodeConfig::GetUnknownDutyCode() const {
    DutyCode code;
    code.SetDutyType(DutyType::Unknown);
    code.SetDutyCode(_unknownDutyCode);
    return code;
}

DutyCode::DutyCode DutyCode::DutyCodeConfig::GetNonFlyDutyCode(const Segment *segment, const Pairing *pairing) const {
    if (const auto& cit = _nonFlyAssignmentDutyCode.find(segment->getAssignment());
        cit != _nonFlyAssignmentDutyCode.end()) {
        for (const auto& [segmentFilter, dutyType, dutyCode, division, _]: cit->second) {
            if (!division.empty() && division != "*" && division != pairing->getDivision()) continue;
            if (segmentFilter.IsPassSegment(segment, pairing)) {
                DutyCode code;
                code.SetDutyType(dutyType);
                code.SetDutyCode(dutyCode);
                return code;
            }
        }
    }
    // nothing match segmentFilter, warn and return unknown;
    spdlog::warn("Segment {} with non-fly assignment {} cannot pass any non-fly duty code segment filter", segment->getDBId(), segment->getAssignment());
    return GetUnknownDutyCode();
}

bool DutyCode::DutyCodeConfig::IsDutyCodeRPICSwappable(const DutyType dutyType) const {
    return RPICSwappableDutyType.find(dutyType) != RPICSwappableDutyType.cend();
}

DutyCode::DutyType DutyCode::DutyCodeConfig::GetNextAlternatingDutyType(const DutyType type) {
    switch (type) {
        case DutyType::CommandingCaptain:
            return DutyType::AugmentingCaptain;
        case DutyType::AugmentingCaptain:
            return DutyType::CommandingCaptain;
        case DutyType::CommandingFirstOfficer:
            return DutyType::AugmentingFirstOfficer;
        case DutyType::AugmentingFirstOfficer:
            return DutyType::CommandingFirstOfficer;
        case DutyType::CommandingBasic:
            return DutyType::AugmentingBasic;
        case DutyType::AugmentingBasic:
            return DutyType::CommandingBasic;
        default: {
            spdlog::error("Try Alternating Non Fly Duty Type or ReliefPilotInCommand, please check for error");
            return DutyType::Unknown;
        }
    }
}

DutyCode::DutyType DutyCode::DutyCodeConfig::TryGetNextAssignmentDutyType(const int flySegmentLocation,
    const DutyType lastFlySegmentDutyType, const std::set<DutyType> &remainingDutyType,
    const std::map<std::string, int>& pairingComplement, const std::map<DutyType, std::string>& availableDutyCodeMap) {

    // calculate the available one by intersecting remainingDutyType and available DutyCodeMap from DutyCodeOptionRow
    std::set<DutyType> availableTypes;
    for (const auto& dutyType: remainingDutyType) {
        if (availableDutyCodeMap.find(dutyType) == availableDutyCodeMap.cend()) continue;
        availableTypes.insert(dutyType);
    }
    // not matching duty type for intersection of remaining and available will return unknown
    if (availableTypes.empty()) return DutyType::Unknown;

    // if the previous segment duty type is flying, try the alternative one
    if (FlyDutyType.find(lastFlySegmentDutyType) != FlyDutyType.end() && lastFlySegmentDutyType != DutyType::ReliefPilotInCruise) {
        // check if this is in the remaining duty type, if so, use this one
        if (const auto alternatingDutyType = GetNextAlternatingDutyType(lastFlySegmentDutyType);
            availableTypes.find(alternatingDutyType) != availableTypes.end()) {
            return alternatingDutyType;
        }
    }
    bool findCPT = true;
    bool findFO = true;
    if (const auto cit = pairingComplement.find("CPT");
        cit == pairingComplement.end() || cit->second == 0) {
        findCPT = false;
    }
    if (const auto cit = pairingComplement.find("FO");
        cit == pairingComplement.end() || cit->second == 0) {
        findFO = false;
    }

    // if no previous duty type, follow the SIA logic, if the segment location (starting with 1) is odd (1, 3, 5) then first try augmenting, even (2, 4) then first try commanding
    if (flySegmentLocation % 2 == 1) { // odd
        if (findCPT && findFO) {
            // try augmenting basic
            if (availableTypes.find(DutyType::AugmentingBasic) != availableTypes.end()) return DutyType::AugmentingBasic;
        } else if (!findCPT && findFO) {
            // try augmenting FO
            if (availableTypes.find(DutyType::AugmentingFirstOfficer) != availableTypes.end()) return DutyType::AugmentingFirstOfficer;
        } else if (findCPT && !findFO) {
            // try augmenting CPT
            if (availableTypes.find(DutyType::AugmentingCaptain) != availableTypes.end()) return DutyType::AugmentingCaptain;
        }
    } else { // even
        if (findCPT && findFO) {
            // try commanding basic
            if (availableTypes.find(DutyType::CommandingBasic) != availableTypes.end()) return DutyType::CommandingBasic;
        } else if (!findCPT && findFO) {
            // try commanding FO
            if (availableTypes.find(DutyType::CommandingFirstOfficer) != availableTypes.end()) return DutyType::CommandingFirstOfficer;
        } else if (findCPT && !findFO) {
            // try commanding CPT
            if (availableTypes.find(DutyType::CommandingCaptain) != availableTypes.end()) return DutyType::CommandingCaptain;
        }
    }

    // up to this point, the Duty code cannot calculate, try the first one
    return *availableTypes.begin();
}

bool DutyCode::DutyCodeConfig::IsConsideredFlySegment(const std::string &assignment) const {
    return _flyAssignments.find(assignment) != _flyAssignments.cend();
}

bool DutyCode::DutyCodeConfig::IsConsideredNonFlySegment(const std::string &assignment) const {
    return _nonFlyAssignments.find(assignment) != _nonFlyAssignments.cend();
}

std::set<std::string> DutyCode::DutyCodeConfig::SplitStringToSet(const std::string &source, const char delim) {
    std::set<std::string> result;
    int start = 0;
    int end = source.find(delim);

    while (end != std::string::npos) {
        result.insert(source.substr(start, end - start));
        start = end + 1;
        end = source.find(delim, start);
    }

    result.insert(source.substr(start));
    return result;
}

std::tuple<int, int, int> DutyCode::DutyCodeConfig::GetCountPilotRankFromPairingCompositionString(
    const std::string &pairingCompositionString) {
    int count = 0;
    int captainNum = 0;
    int firstOfficerNum = 0;

    // string format: X*C+F (X is count, C is Captain, F is FirstOfficer)
    std::string tempStrStore;
    for (const auto& digit: pairingCompositionString) {
        if (constexpr char countDelim = '*'; digit == countDelim) {
            count = std::stoi(tempStrStore);
            tempStrStore.clear();
        } else if (constexpr char rankDelim = '+'; digit == rankDelim) {
            captainNum = std::stoi(tempStrStore);
            tempStrStore.clear();
        } else {
            tempStrStore.push_back(digit);
        }
    }
    firstOfficerNum = std::stoi(tempStrStore);

    return {count, captainNum, firstOfficerNum};
}

std::pair<int, int> DutyCode::DutyCodeConfig::GetCountPilotRankFromSegmentCompositionString(
    const std::string &segmentCompositionString) {
    int captainNum = 0;
    int firstOfficerNum = 0;

    // string format: C+F (C is Captain, F is FirstOfficer)
    std::string tempStrStore;
    for (const auto& digit: segmentCompositionString) {
        if (constexpr char rankDelim = '+'; digit == rankDelim) {
            captainNum = std::stoi(tempStrStore);
            tempStrStore.clear();
        } else {
            tempStrStore.push_back(digit);
        }
    }
    firstOfficerNum = std::stoi(tempStrStore);

    return {captainNum, firstOfficerNum};
}

std::set<DutyCode::DutyType> DutyCode::DutyCodeConfig::GetDutyTypeCombinationFromString(
    const std::string &dutyTypeString) {
    constexpr char delim = '+';
    std::vector<std::string> splitStrings;
    std::set<DutyType> result;
    split(dutyTypeString, delim, splitStrings);
    for (const auto& str: splitStrings) {
        result.insert(GetMappedDutyType(str));
    }
    return result;
}
