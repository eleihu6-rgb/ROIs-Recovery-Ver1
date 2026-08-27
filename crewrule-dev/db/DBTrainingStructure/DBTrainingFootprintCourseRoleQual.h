#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEROLEQUAL_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEROLEQUAL_H

#include <vector>
#include <string>

class DBTrainingFootprintCourseRoleQual {
public:
    DBTrainingFootprintCourseRoleQual(long long id, long long footprintCourseRoleId,
                                      long long footprintCourseRoleBaseId,
                                      std::vector<std::string> roleQuals, std::string roleQualOption,
                                      int roleNumber) :
        _id(id), _footprintCourseRoleId(footprintCourseRoleId),
        _footprintCourseRoleBaseId(footprintCourseRoleBaseId),
        _roleQuals(std::move(roleQuals)), _roleQualOption(std::move(roleQualOption)),
        _roleNumber(roleNumber) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintCourseRoleId() const { return _footprintCourseRoleId; }
    [[nodiscard]] long long GetFootprintCourseRoleBaseId() const { return _footprintCourseRoleBaseId; }
    [[nodiscard]] const std::vector<std::string>& GetRoleQuals() const { return _roleQuals; }
    [[nodiscard]] const std::string& GetRoleQualOption() const { return _roleQualOption; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }

private:
    long long _id;
    long long _footprintCourseRoleId;
    long long _footprintCourseRoleBaseId;
    std::vector<std::string> _roleQuals;
    std::string _roleQualOption;
    int _roleNumber;
};

#endif
