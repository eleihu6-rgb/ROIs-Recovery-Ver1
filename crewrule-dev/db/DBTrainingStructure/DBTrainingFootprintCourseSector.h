//
// Created by haoli on 2026/3/27.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSESECTOR_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSESECTOR_H

#include "unordered_set"
#include "string"

class DBTrainingFootprintCourseSector {
public:
    DBTrainingFootprintCourseSector(long long id, long long footprintCourseId, int sector,
                              const std::unordered_set<std::string> &airports) :
    _id(id), _footprintCourseId(footprintCourseId), _sector(sector), _airports(airports) {}

    long long GetId() const { return _id; }

    void SetId(const long long id) { _id = id; }

    long long GetFootprintCourseId() const { return _footprintCourseId; }

    void SetFootprintCourseId(const long long footprintCourseId) { _footprintCourseId = footprintCourseId; }

    void SetAirports(const std::unordered_set<std::string> &airports) { _airports = airports; }

    [[nodiscard]] const std::unordered_set<std::string> &GetAirports() const { return _airports; }
    [[nodiscard]] const int GetSector() const { return _sector; }

private:
    long long _id;
    long long _footprintCourseId;
    int _sector{0};
    std::unordered_set<std::string> _airports;
};

#endif //TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSESECTOR_H
