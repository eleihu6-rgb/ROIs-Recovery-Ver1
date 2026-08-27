//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAM_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAM_H

#include <utility>

#include "string"

class DBTrainingProgram {
public:
    enum Status{
        Not_Scheduled,
        Partial_Scheduled,
        Scheduled,
        Completed,
        Manual_End
    };
    DBTrainingProgram(long long id, std::string name, std::string crewId, time_t startDate, time_t endDate, Status status, long long footprintId) :
            _id(id), _name(std::move(name)), _crewId(std::move(crewId)), _startDate(startDate), _endDate(endDate), _status(status), _footprintId(footprintId) {}

    [[nodiscard]] long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    [[nodiscard]] const std::string &GetName() const { return _name; }

    void SetName(const std::string &name) { _name = name; }

    [[nodiscard]] const std::string &GetCrewId() const { return _crewId; }

    void SetCrewId(const std::string &crewId) { _crewId = crewId; }

    [[nodiscard]] time_t GetStartDate() const { return _startDate; }

    void SetStartDate(time_t startDate) { _startDate = startDate; }

    [[nodiscard]] time_t GetEndDate() const { return _endDate; }

    void SetEndDate(time_t endDate) { _endDate = endDate; }

    [[nodiscard]] Status GetStatus() const { return _status; }

    void SetStatus(Status status) { _status = status; }

    long long GetFootprintId() const { return _footprintId; }
    void SetFootprintId(long long footprintId) { _footprintId = footprintId; }

private:
    long long _id;
    long long _footprintId;
    std::string _name;
    std::string _crewId;        //Assumption: 1 program only has one trainee
    time_t _startDate = 0;
    time_t _endDate = 0;
    Status _status;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPROGRAM_H
