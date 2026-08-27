//
// Created by Yuhao Wang on 2025/12/4.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODESEGMENTFILTER_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODESEGMENTFILTER_H

#include <string>
#include <set>
#include "Segment.h"
#include "Pairing.h"

namespace DutyCode {
    class DutyCodeSegmentFilter {
    public:
        explicit DutyCodeSegmentFilter() = default;

        void PushDepartureStation(const std::string& departureStation) { _departureStations.insert(departureStation); }
        void PushArrivalStation(const std::string& arrivalStation) { _arrivalStations.insert(arrivalStation); }
        void SetCheckOnlyAssignmentDhdDuty(const bool flag) { _checkOnlyAssignmentDhdDuty = flag; }

        [[nodiscard]] bool IsPassSegment(const Segment* segment, const Pairing* pairing) const;
    private:
        std::set<std::string> _departureStations;
        std::set<std::string> _arrivalStations;
        bool _checkOnlyAssignmentDhdDuty = false;
    };
}



#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODESEGMENTFILTER_H
