//
// Created by haoli on 2026/1/13.
//

#ifndef DBTRAININGOPTIMIZER_TRAININGCOURSETIME_H
#define DBTRAININGOPTIMIZER_TRAININGCOURSETIME_H

#include "string"
#include "vector"
#include "DBTrainingCourseRoleRequirement.h"

class DBTrainingCourseDuration {
public:
    DBTrainingCourseDuration(long long id, long long courseId, int num, long long duration) :
            _id(id), _courseId(courseId), _num(num), _duration(duration) {}
    void SetID(long long id) {_id = id;}
    void SetCourseID(long long id) {_courseId = id;}
    void SetNum(int num) {_num = num;}
    void SetDuration(long long duration) {_duration = duration;}
    long long GetID() const {return _id;}
    long long GetCourseID() const {return _courseId;}
    int GetNum() const {return _num;}
    long long GetDuration() const {return _duration;}

private:
    long long _id{0};
    long long _courseId{0};
    int _num{-1};
    long long _duration{-1};
};

class DBTrainingCourseBrief {
public:
    enum BriefType {
        Brief,
        Debrief
    };

    DBTrainingCourseBrief(long long id, long long courseId, const std::vector<DBTrainingCourseRoleRequirement::RoleType> &roles, BriefType type,
                        long long briefTime)
            : _id(id), _courseId(courseId), _roles(roles), _type(type), _time(briefTime) {}

    void SetID(long long id) {_id = id;}
    void SetCourseID(long long id) {_courseId = id;}
    void SetRoles(const std::vector<DBTrainingCourseRoleRequirement::RoleType> &roles) {_roles = roles;}
    void SetType(BriefType type) {_type = type;}
    void SetTime(long long time) {_time = time;}
    long long GetID() const {return _id;}
    long long GetCourseID() const {return _courseId;}
    const std::vector<DBTrainingCourseRoleRequirement::RoleType> &GetRoles() const {return _roles;}
    BriefType GetType() const {return _type;}
    long long GetTime() const {return _time;}

private:
    long long _id{0};
    long long _courseId{0};
    std::vector<DBTrainingCourseRoleRequirement::RoleType> _roles;
    BriefType _type{Brief};
    long long _time{0};
};

#endif //DBTRAININGOPTIMIZER_TRAININGCOURSETIME_H
