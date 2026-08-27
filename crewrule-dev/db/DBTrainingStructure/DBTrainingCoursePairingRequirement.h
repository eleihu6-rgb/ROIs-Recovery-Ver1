//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEPAIRINGREQUIREMENT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEPAIRINGREQUIREMENT_H

#include "string"
#include "variant"

class DBTrainingCoursePairingRequirement {
public:
    enum class RequirementType {
        Attribute,
        Layover,
        Destination,
        Label
    };

    DBTrainingCoursePairingRequirement(long long courseId, RequirementType requirementType,
                                       const std::string &requirementValue) : _courseId(
            courseId), _requirementType(requirementType), _requirementValue(requirementValue) {}

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const RequirementType GetRequirementType() const { return _requirementType; }

    void SetRequirementType(RequirementType type) { _requirementType = type; }

    const std::string &GetRequirementValue() const { return _requirementValue; }

    void SetRequirementValue(const std::string &value) { _requirementValue = value; }

private:
    long long _courseId;
    RequirementType _requirementType;
    std::string _requirementValue;
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEPAIRINGREQUIREMENT_H
