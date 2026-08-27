//
// Created by haoli on 2026/4/16.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEROLE_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEROLE_H

#include "DBTrainingCourseRoleBase.h"

#include <memory>
#include <string>
#include <vector>
#include <limits>

class DBTrainingCourseRole {
public:
    DBTrainingCourseRole(long long id, long long courseId, std::string role, int minCapacity, int maxCapacity,
                         std::vector<std::unique_ptr<DBTrainingCourseRoleBase>> &&roleBases)
            : _id(id), _courseId(courseId), _role(std::move(role)), _minCapacity(minCapacity),
              _maxCapacity(maxCapacity), _roleBases(std::move(roleBases)) {
        if (_minCapacity < 0) _minCapacity = 0;
        if (_maxCapacity < 0) _maxCapacity = std::numeric_limits<int>::max();
    }

    DBTrainingCourseRole(const DBTrainingCourseRole &) = delete;

    DBTrainingCourseRole &operator=(const DBTrainingCourseRole &) = delete;

    DBTrainingCourseRole(DBTrainingCourseRole &&) = delete;

    DBTrainingCourseRole &operator=(DBTrainingCourseRole &&) = delete;

    long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const std::string &GetRole() const { return _role; }

    void SetRole(std::string role) { _role = std::move(role); }

    int GetMinCapacity() const { return _minCapacity; }

    void SetMinCapacity(int minCapacity) { _minCapacity = minCapacity; }

    int GetMaxCapacity() const { return _maxCapacity; }

    void SetMaxCapacity(int maxCapacity) { _maxCapacity = maxCapacity; }

    const std::vector<std::unique_ptr<DBTrainingCourseRoleBase>> &GetRoleBases() const { return _roleBases; }

    void SetRoleBases(std::vector<std::unique_ptr<DBTrainingCourseRoleBase>> &&roleBases) {
        _roleBases = std::move(roleBases);
    }

private:
    long long _id{0};
    long long _courseId{0};
    std::string _role;
    int _minCapacity{-1};
    int _maxCapacity{-1};
    std::vector<std::unique_ptr<DBTrainingCourseRoleBase>> _roleBases;
};

#endif // TRAININGOPTIMIZER_DBTRAININGCOURSEROLE_H
