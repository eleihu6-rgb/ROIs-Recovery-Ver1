//
// Created by haoli on 2026/4/16.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEROLEQUAL_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEROLEQUAL_H

#include <string>
#include <vector>

class DBTrainingCourseRoleQual {
public:
    DBTrainingCourseRoleQual(long long id, long long tmCourseBaseId, std::string condition,
                             std::vector<std::string> qualifications, int peopleLimit)
            : _id(id), _tmCourseBaseId(tmCourseBaseId), _condition(std::move(condition)),
              _qualifications(std::move(qualifications)), _peopleLimit(peopleLimit) {}

    long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    long long GetTmCourseBaseId() const { return _tmCourseBaseId; }

    void SetTmCourseBaseId(long long tmCourseBaseId) { _tmCourseBaseId = tmCourseBaseId; }

    const std::string &GetCondition() const { return _condition; }

    void SetCondition(std::string condition) { _condition = std::move(condition); }

    const std::vector<std::string> &GetQualifications() const { return _qualifications; }

    void SetQualifications(std::vector<std::string> qualifications) {
        _qualifications = std::move(qualifications);
    }

    int GetPeopleLimit() const { return _peopleLimit; }

    void SetPeopleLimit(int peopleLimit) { _peopleLimit = peopleLimit; }

private:
    long long _id{0};
    long long _tmCourseBaseId{0};
    std::string _condition;
    std::vector<std::string> _qualifications;
    int _peopleLimit{-1};
};

#endif // TRAININGOPTIMIZER_DBTRAININGCOURSEROLEQUAL_H
