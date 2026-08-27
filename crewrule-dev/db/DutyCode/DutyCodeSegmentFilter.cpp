//
// Created by Yuhao Wang on 2025/12/4.
//

#include <algorithm>

#include "DutyCodeSegmentFilter.h"

bool DutyCode::DutyCodeSegmentFilter::IsPassSegment(const Segment* segment, const Pairing* pairing) const {
    if (!_departureStations.empty()) {
        if (_departureStations.find(segment->getDepStationRead()) == _departureStations.cend()) return false;
    }

    if (!_arrivalStations.empty()) {
        if (_arrivalStations.find(segment->getArrStationRead()) == _arrivalStations.cend()) return false;
    }

    if (_checkOnlyAssignmentDhdDuty) {
        bool pass = false;
        for (const auto& duty: pairing->getDutyVec()) {
            const auto& dutySegments = duty->getSegmentsRead();
            const bool containsSegment = std::any_of(dutySegments.cbegin(), dutySegments.cend(),
                [&segment](const Segment* dutySegment) {
                    return dutySegment->getDBId() == segment->getDBId();
                });
            const bool onlyAssignmentDhd = std::all_of(dutySegments.cbegin(), dutySegments.cend(),
                [](const Segment* dutySegment) {
                    return dutySegment->getAssignment() == "DHD";
                });
            if (containsSegment && onlyAssignmentDhd) {
                pass = true;
                break;
            }
        }
        if (!pass) return false;
    }

    return true;
}
