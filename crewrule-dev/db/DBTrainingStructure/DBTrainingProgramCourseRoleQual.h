#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLEQUAL_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLEQUAL_H

#include <vector>
#include <string>

class DBTrainingProgramCourseRoleQual {
public:
    DBTrainingProgramCourseRoleQual(long long id, long long programCourseRoleId,
                                       long long programCourseRoleBaseId,
                                       std::vector<std::string> roleQuals, std::string roleQualOption,
                                       int roleNumber) :
        _id(id), _programCourseRoleId(programCourseRoleId),
        _programCourseRoleBaseId(programCourseRoleBaseId),
        _roleQuals(std::move(roleQuals)), _roleQualOption(std::move(roleQualOption)),
        _roleNumber(roleNumber) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramCourseRoleId() const { return _programCourseRoleId; }
    [[nodiscard]] long long GetProgramCourseRoleBaseId() const { return _programCourseRoleBaseId; }
    [[nodiscard]] const std::vector<std::string>& GetRoleQuals() const { return _roleQuals; }
    [[nodiscard]] const std::string& GetRoleQualOption() const { return _roleQualOption; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }

private:
    long long _id;
    long long _programCourseRoleId;
    long long _programCourseRoleBaseId;
    std::vector<std::string> _roleQuals;
    std::string _roleQualOption;
    int _roleNumber;
};

#endif
