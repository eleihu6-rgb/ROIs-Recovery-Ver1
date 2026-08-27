//
// Created by haoli on 2026/1/17.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEFOOTPRINT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEFOOTPRINT_H

#include "unordered_set"
#include "string"

class DBTrainingFootprintCourse {
public:
    DBTrainingFootprintCourse(long long id, long long courseId, long long footprintId, const std::string &footprintName,
                              const std::unordered_set<std::string> &fleets, long long duration, int sectorNumber) :
    _footprintName(footprintName),
    _courseId(courseId), _id(id), _footprintId(footprintId), _fleets(fleets), _duration(duration), _sectorNumber(sectorNumber) {}

    [[nodiscard]] long long GetDuration() const { return _duration; }
    void SetDuration(long long duration) { _duration = duration; }

    [[nodiscard]] int GetSectorNumber() const { return _sectorNumber; }
    void SetSectorNumber(int sectorNumber) { _sectorNumber = sectorNumber; }

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    const long long GetFootprintId() const { return _footprintId; }

    void SetFootprintId(long long footprintId) { _footprintId = footprintId; }

    const std::string &GetFootprintName() const { return _footprintName; }

    void SetFootprintName(const std::string &footprintName) { _footprintName = footprintName; }

    void SetFleets(const std::unordered_set<std::string> &fleets) { _fleets = fleets; }

    const std::unordered_set<std::string> &GetFleets() const { return _fleets; }

private:
    long long _id;
    long long _courseId;
    long long _footprintId;
    std::string _footprintName;
    std::unordered_set<std::string> _fleets;
    long long _duration{0};
    int _sectorNumber{0};
};

#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEFOOTPRINT_H
