//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEGRANTQUALIFICATION_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEGRANTQUALIFICATION_H

#include "string"

class DBTrainingCourseGrantQualification {
public:
    DBTrainingCourseGrantQualification(long long courseId, const std::string &qualification,
                                       long long effectiveExtension) :
            _courseId(courseId), _qualification(qualification), _effectiveExtension(effectiveExtension) {}

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long id) { _courseId = id; }

    const std::string &GetQualification() const { return _qualification; }

    void SetQualification(const std::string &qualification) { _qualification = qualification; }

    const long long GetEffectiveExtension() const { return _effectiveExtension; }

    void SetEffectiveExtension(long long effectiveExtension) { _effectiveExtension = effectiveExtension; }

private:
    long long _courseId;
    std::string _qualification;
    long long _effectiveExtension;
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEGRANTQUALIFICATION_H
