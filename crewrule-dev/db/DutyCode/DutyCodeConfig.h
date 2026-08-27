//
// Created by Yuhao Wang on 2025/11/28.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODECONFIG_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODECONFIG_H

#include <vector>
#include "Pairing.h"
#include "DutyCodeOption.h"
#include "SegmentAggregationInfo.h"
#include "DutyCodeSegmentFilter.h"
#include "CrewDB.h"

namespace DutyCode {
    class DutyCodeConfig {
    public:
        explicit DutyCodeConfig();
        void CalculateLinkedDutyCodeOption(SegmentAggregationInfo& info, const std::string& division) const;
        void BuildDutyCodeConfig(const std::vector<std::shared_ptr<DutyCodeTypeComp>>& dutyCodeTypeCompositionVec,
                                 const std::unordered_map<long long, std::vector<std::shared_ptr<DutyCodeLogic>>>& dutyCodeLogicMap);

        void SetUnknownDutyCode(const std::string &unknownDutyCode) { _unknownDutyCode = unknownDutyCode; }
        void SetAssignFlySegment(const bool flag) { _assignFlySegment = flag; }



        [[nodiscard]] bool IsConsideredFlySegment(const Segment* segment) const;
        [[nodiscard]] bool IsConsideredNonFlySegment(const Segment* segment) const;
        [[nodiscard]] bool IsApplicableForAutoAssignment(const std::set<DutyType>& needToBeAssignedDutyTypeCombination) const;
        [[nodiscard]] DutyCode GetUnknownDutyCode() const;
        [[nodiscard]] DutyCode GetNonFlyDutyCode(const Segment* segment, const Pairing* pairing) const;
        [[nodiscard]] bool IsDutyCodeRPICSwappable(DutyType dutyType) const;
        [[nodiscard]] bool IsAssignFlySegment() const { return _assignFlySegment; }


        static DutyType GetNextAlternatingDutyType(DutyType type);

        // Determine the proper duty code type for the next assignment, return unknown if it cannot decide
        static DutyType TryGetNextAssignmentDutyType(int flySegmentLocation, DutyType lastFlySegmentDutyType,
            const std::set<DutyType>& remainingDutyType, const std::map<std::string, int>& pairingComplement, const std::map<DutyType, std::string>& availableDutyCodeMap);

    private:

        struct NonFlyAssignmentDutyCodeLogic {
            explicit NonFlyAssignmentDutyCodeLogic(DutyCodeSegmentFilter filter, DutyType dutyType, std::string dutyCode, std::string division, int priority)
                :filter(std::move(filter)), dutyType(dutyType), dutyCode(std::move(dutyCode)), division(std::move(division)), priority(priority) {}

            DutyCodeSegmentFilter filter;
            DutyType dutyType;
            std::string dutyCode;
            std::string division;
            int priority;
        };

        void PushFlyAssignment(const std::string& assignmentCode) { _flyAssignments.insert(assignmentCode); }
        void PushNonFlyAssignment(const std::string& assignmentCode) { _nonFlyAssignments.insert(assignmentCode); }


        void SetNonFlyAssignmentDutyCode(const std::string &nonFlyAssignment, DutyType nonFlyDutyType, const std::string &nonFlyDutyCode, const std::string& division, DutyCodeSegmentFilter segmentFilter, int priority) {
            _nonFlyAssignmentDutyCode[nonFlyAssignment].emplace_back(std::move(segmentFilter), nonFlyDutyType, nonFlyDutyCode, division, priority);
        }
        void PushFlyDutyCodeOptions(DutyCodeOption dutyCodeOption) { _flyDutyCodeOptions.emplace_back(std::move(dutyCodeOption)); }
        [[nodiscard]] bool IsConsideredFlySegment(const std::string& assignment) const;
        [[nodiscard]] bool IsConsideredNonFlySegment(const std::string& assignment) const;

        std::vector<DutyCodeOption> _flyDutyCodeOptions;

        std::set<std::string> _flyAssignments;
        std::set<std::string> _nonFlyAssignments;
        std::map<std::string, std::vector<NonFlyAssignmentDutyCodeLogic>> _nonFlyAssignmentDutyCode;
        std::set<DutyType> _avoidAutoAssignedDutyTypes{DutyType::ReliefPilotInCruise}; // by default, ReliefPilotInCruise will not be included for auto assignment
        static const std::set<DutyType> RPICSwappableDutyType;

        std::string _unknownDutyCode = "Unknown";
        bool _assignFlySegment = true;

        // configuration helpers
        static std::set<std::string> SplitStringToSet(const std::string& source, char delim);
        static std::tuple<int, int, int> GetCountPilotRankFromPairingCompositionString(const std::string& pairingCompositionString);
        static std::pair<int, int> GetCountPilotRankFromSegmentCompositionString(const std::string& segmentCompositionString);
        static std::set<DutyType> GetDutyTypeCombinationFromString(const std::string& dutyTypeString);
    };
}


#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODECONFIG_H
